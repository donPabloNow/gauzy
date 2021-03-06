import { Component, OnInit, ViewChild } from '@angular/core';
import { TranslationBaseComponent } from '../../../@shared/language-base/translation-base.component';
import { TranslateService } from '@ngx-translate/core';
import { ActivatedRoute } from '@angular/router';
import { InvoicesService } from '../../../@core/services/invoices.service';
import { IInvoice, IPayment, InvoiceStatusTypesEnum } from '@gauzy/models';
import { LocalDataSource } from 'ng2-smart-table';
import { PaymentMutationComponent } from './payment-mutation/payment-mutation.component';
import { NbDialogService, NbToastrService } from '@nebular/theme';
import { PaymentService } from '../../../@core/services/payment.service';
import { DeleteConfirmationComponent } from '../../../@shared/user/forms/delete-confirmation/delete-confirmation.component';
import { first } from 'rxjs/operators';
import * as pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';
import { generatePdf } from '../../../@shared/payment/generate-pdf';
import { StatusBadgeComponent } from '../../../@shared/status-badge/status-badge.component';
import { Store } from '../../../@core/services/store.service';
import { InvoiceEstimateHistoryService } from '../../../@core/services/invoice-estimate-history.service';

export interface SelectedPayment {
	data: IPayment;
	isSelected: false;
}

@Component({
	selector: 'ga-payments',
	templateUrl: './payments.component.html',
	styleUrls: ['./payments.component.scss']
})
export class InvoicePaymentsComponent extends TranslationBaseComponent
	implements OnInit {
	constructor(
		private route: ActivatedRoute,
		readonly translateService: TranslateService,
		private invoicesService: InvoicesService,
		private dialogService: NbDialogService,
		private paymentService: PaymentService,
		private toastrService: NbToastrService,
		private store: Store,
		private invoiceEstimateHistoryService: InvoiceEstimateHistoryService
	) {
		super(translateService);
	}

	invoiceId: string;
	invoice: IInvoice;
	payments: IPayment[];
	totalPaid = 0;
	leftToPay = 0;
	barWidth = 0;
	settingsSmartTable: object;
	smartTableSource = new LocalDataSource();
	selectedPayment: IPayment;
	disableButton = true;

	@ViewChild('paymentsTable') paymentsTable;

	ngOnInit() {
		this.route.paramMap.subscribe((params) => {
			this.invoiceId = params.get('id');
		});
		this.executeInitialFunctions();
		this.loadSmartTable();
		this._applyTranslationOnSmartTable();
	}

	async executeInitialFunctions() {
		await this.getInvoice();
		this.loadSettings();
		await this.calculateTotalPaid();
	}

	async getInvoice() {
		const invoice = await this.invoicesService.getById(this.invoiceId, [
			'invoiceItems',
			'tags',
			'fromOrganization',
			'toContact'
		]);
		this.invoice = invoice;
	}

	async calculateTotalPaid() {
		this.totalPaid = 0;
		const tableData = await this.smartTableSource.getAll();
		for (const payment of tableData) {
			this.totalPaid += +payment.amount;
		}
		this.barWidth = +(
			(this.totalPaid / this.invoice.totalValue) *
			100
		).toFixed(2);
		if (this.barWidth > 100) {
			this.barWidth = 100;
		}
		const progressBar = document.getElementById('progress-bar-inner');
		progressBar.style.width = `${this.barWidth}%`;
		if (this.totalPaid >= this.invoice.totalValue) {
			if (!this.invoice.paid) {
				await this.invoicesService.update(this.invoice.id, {
					paid: true
				});
			}
		} else {
			if (this.invoice.paid) {
				await this.invoicesService.update(this.invoice.id, {
					paid: false
				});
			}
		}

		this.leftToPay = this.invoice.totalValue - this.totalPaid;

		if (this.leftToPay < 0) {
			this.leftToPay = 0;
		}
	}

	async recordPayment() {
		const result = await this.dialogService
			.open(PaymentMutationComponent, {
				context: {
					invoice: this.invoice
				}
			})
			.onClose.pipe(first())
			.toPromise();

		if (result) {
			await this.paymentService.add(result);
			this.totalPaid = 0;
			await this.loadSettings();
			await this.updateInvoiceStatus(
				+this.invoice.totalValue,
				this.totalPaid
			);
			await this.invoiceEstimateHistoryService.add({
				action: `Payment of ${result.amount} ${result.currency} added`,
				invoice: result.invoice,
				invoiceId: result.invoice.id,
				user: this.store.user,
				userId: this.store.userId,
				organization: this.invoice.fromOrganization,
				organizationId: this.invoice.fromOrganization.id
			});
		}
	}

	async editPayment() {
		const result = await this.dialogService
			.open(PaymentMutationComponent, {
				context: {
					invoice: this.invoice,
					payment: this.selectedPayment
				}
			})
			.onClose.pipe(first())
			.toPromise();

		if (result) {
			await this.paymentService.update(result.id, result);
			await this.loadSettings();
			await this.updateInvoiceStatus(
				+this.invoice.totalValue,
				this.totalPaid
			);
			await this.invoiceEstimateHistoryService.add({
				action: `Payment edited`,
				invoice: result.invoice,
				invoiceId: result.invoice.id,
				user: this.store.user,
				userId: this.store.userId,
				organization: this.invoice.fromOrganization,
				organizationId: this.invoice.fromOrganization.id
			});
		}
	}

	async deletePayment() {
		const result = await this.dialogService
			.open(DeleteConfirmationComponent)
			.onClose.pipe(first())
			.toPromise();

		if (result) {
			await this.paymentService.delete(this.selectedPayment.id);
			await this.loadSettings();
			await this.updateInvoiceStatus(
				+this.invoice.totalValue,
				this.totalPaid
			);

			await this.invoiceEstimateHistoryService.add({
				action: `Payment deleted`,
				invoice: this.invoice,
				invoiceId: this.invoice.id,
				user: this.store.user,
				userId: this.store.userId,
				organization: this.invoice.fromOrganization,
				organizationId: this.invoice.fromOrganization.id
			});

			this.toastrService.primary(
				this.getTranslation('INVOICES_PAGE.PAYMENTS.PAYMENT_DELETE'),
				this.getTranslation('TOASTR.TITLE.SUCCESS')
			);
		}
		this.disableButton = true;
	}

	async download() {
		const tableData = await this.smartTableSource.getAll();
		if (!tableData.length) {
			this.toastrService.danger(
				this.getTranslation(
					'INVOICES_PAGE.PAYMENTS.NO_PAYMENTS_RECORDED'
				),
				this.getTranslation('TOASTR.TITLE.WARNING')
			);
			return;
		}
		pdfMake.vfs = pdfFonts.pdfMake.vfs;

		const docDefinition = await generatePdf(
			this.invoice,
			this.payments,
			this.invoice.fromOrganization,
			this.invoice.toContact,
			this.totalPaid
		);

		pdfMake.createPdf(docDefinition).download(`Payment.pdf`);
	}

	async selectPayment($event: SelectedPayment) {
		if ($event.isSelected) {
			this.selectedPayment = $event.data;
			this.disableButton = false;
			this.paymentsTable.grid.dataSet.willSelect = false;
		} else {
			this.disableButton = true;
		}
	}

	loadSmartTable() {
		this.settingsSmartTable = {
			actions: false,
			columns: {
				paymentDate: {
					title: this.getTranslation(
						'INVOICES_PAGE.PAYMENTS.PAYMENT_DATE'
					),
					type: 'text',
					valuePrepareFunction: (cell, row) => {
						return `${cell.slice(0, 10)}`;
					}
				},
				amount: {
					title: this.getTranslation('INVOICES_PAGE.PAYMENTS.AMOUNT'),
					type: 'text'
				},
				recordedBy: {
					title: this.getTranslation(
						'INVOICES_PAGE.PAYMENTS.RECORDED_BY'
					),
					type: 'text',
					valuePrepareFunction: (cell, row) => {
						if (cell.firstName && cell.lastName) {
							return `${cell.firstName} ${cell.lastName}`;
						} else {
							return ``;
						}
					}
				},
				note: {
					title: this.getTranslation('INVOICES_PAGE.PAYMENTS.NOTE'),
					type: 'text'
				},
				paymentMethod: {
					title: this.getTranslation(
						'INVOICES_PAGE.PAYMENTS.PAYMENT_METHOD'
					),
					type: 'text'
				},
				overdue: {
					title: this.getTranslation('INVOICES_PAGE.PAYMENTS.STATUS'),
					type: 'custom',
					width: '5%',
					renderComponent: StatusBadgeComponent,
					valuePrepareFunction: (cell, row) => {
						let badgeClass;
						if (cell && row.overdue) {
							badgeClass = 'danger';
							cell = this.getTranslation(
								'INVOICES_PAGE.PAYMENTS.OVERDUE'
							);
						} else if (cell) {
							badgeClass = 'success';
							cell = this.getTranslation(
								'INVOICES_PAGE.PAYMENTS.ON_TIME'
							);
						}
						return {
							text: cell,
							class: badgeClass
						};
					}
				}
			}
		};
	}

	async loadSettings() {
		const { items } = await this.paymentService.getAll(
			['invoice', 'recordedBy'],
			{ invoiceId: this.invoiceId }
		);
		this.payments = items;
		this.smartTableSource.load(items);
		await this.calculateTotalPaid();
	}

	async updateInvoiceStatus(totalValue: number, totalPaid: number) {
		if (totalPaid <= 0) {
			await this.invoicesService.update(this.invoice.id, {
				status: InvoiceStatusTypesEnum.VIEWED
			});
		} else if (totalPaid < totalValue) {
			await this.invoicesService.update(this.invoice.id, {
				status: InvoiceStatusTypesEnum.PARTIALLY_PAID
			});
		} else if (totalPaid === totalValue) {
			await this.invoicesService.update(this.invoice.id, {
				status: InvoiceStatusTypesEnum.FULLY_PAID
			});
		} else {
			await this.invoicesService.update(this.invoice.id, {
				status: InvoiceStatusTypesEnum.OVERPAID
			});
		}
	}

	_applyTranslationOnSmartTable() {
		this.translateService.onLangChange.subscribe(() => {
			this.loadSmartTable();
		});
	}
}
