// tslint:disable: nx-enforce-module-boundaries
import { Component, OnInit, ViewChild, OnDestroy } from '@angular/core';
import {
	IGetTimeLogInput,
	ITimeLog,
	IOrganization,
	IDateRange,
	PermissionsEnum,
	ITimeLogFilters,
	OrganizationPermissionsEnum
} from '@gauzy/models';
import { toUTC } from 'libs/utils';
import {
	NbCheckboxComponent,
	NbDialogService,
	NbMenuService
} from '@nebular/theme';
import { Store } from 'apps/gauzy/src/app/@core/services/store.service';
import { takeUntil, filter, map, debounceTime } from 'rxjs/operators';
import { Subject } from 'rxjs/internal/Subject';
import { TimesheetService } from 'apps/gauzy/src/app/@shared/timesheet/timesheet.service';
import { EditTimeLogModalComponent } from 'apps/gauzy/src/app/@shared/timesheet/edit-time-log-modal/edit-time-log-modal.component';
import { untilDestroyed } from 'ngx-take-until-destroy';
import { ViewTimeLogModalComponent } from 'apps/gauzy/src/app/@shared/timesheet/view-time-log-modal/view-time-log-modal/view-time-log-modal.component';
import { ConfirmComponent } from 'apps/gauzy/src/app/@shared/dialogs';
import { TranslateService } from '@ngx-translate/core';

@Component({
	selector: 'ngx-daily',
	templateUrl: './daily.component.html',
	styleUrls: ['./daily.component.scss']
})
export class DailyComponent implements OnInit, OnDestroy {
	OrganizationPermissionsEnum = OrganizationPermissionsEnum;
	PermissionsEnum = PermissionsEnum;
	timeLogs: ITimeLog[];
	today: Date = new Date();
	checkboxAll = false;
	selectedIds: any = {};
	selectedDate: Date = new Date();

	private _ngDestroy$ = new Subject<void>();
	@ViewChild('checkAllCheckbox')
	checkAllCheckbox: NbCheckboxComponent;
	organization: IOrganization;
	addEditTimeRequest: any = {
		isBillable: true,
		projectId: null,
		taskId: null,
		description: ''
	};
	selectedRange: IDateRange = { start: null, end: null };
	showBulkAction = false;
	bulkActionOptions = [
		{
			title: 'Delete'
		}
	];
	logRequest: ITimeLogFilters = {};

	updateLogs$: Subject<any> = new Subject();
	loading: boolean;

	constructor(
		private timesheetService: TimesheetService,
		private dialogService: NbDialogService,
		private store: Store,
		private nbMenuService: NbMenuService,
		private translateService: TranslateService
	) {}

	async ngOnInit() {
		this.nbMenuService
			.onItemClick()
			.pipe(
				takeUntil(this._ngDestroy$),
				filter(({ tag }) => tag === 'time-logs-bulk-acton'),
				map(({ item: { title } }) => title)
			)
			.subscribe((title) => this.bulkAction(title));

		this.store.selectedOrganization$
			.pipe(takeUntil(this._ngDestroy$))
			.subscribe((organization: IOrganization) => {
				this.organization = organization;
				this.updateLogs$.next();
			});

		this.updateLogs$
			.pipe(takeUntil(this._ngDestroy$), debounceTime(500))
			.subscribe(() => {
				this.getLogs();
			});

		this.updateLogs$.next();
	}

	async filtersChange($event: ITimeLogFilters) {
		this.logRequest = $event;
		this.selectedDate = new Date(this.logRequest.startDate);
		this.updateLogs$.next();
	}
	async getLogs() {
		if (!this.organization) {
			return;
		}

		const { employeeIds, startDate, endDate } = this.logRequest;

		const request: IGetTimeLogInput = {
			organizationId: this.organization.id,
			...this.logRequest,
			startDate: toUTC(startDate).format('YYYY-MM-DD HH:mm:ss'),
			endDate: toUTC(endDate).format('YYYY-MM-DD HH:mm:ss'),
			...(employeeIds ? { employeeIds } : {})
		};

		this.loading = true;
		this.timeLogs = await this.timesheetService
			.getTimeLogs(request)
			.then((logs) => {
				this.selectedIds = {};
				if (this.checkAllCheckbox) {
					this.checkAllCheckbox.checked = false;
					this.checkAllCheckbox.indeterminate = false;
				}
				logs.forEach((log) => (this.selectedIds[log.id] = false));
				return logs;
			})
			.finally(() => (this.loading = false));
	}

	toggleCheckbox(event: any, type?: any) {
		if (type === 'all') {
			for (const key in this.selectedIds) {
				if (this.selectedIds.hasOwnProperty(key)) {
					this.selectedIds[key] = event.target.checked;
				}
			}
		} else {
			let all_checked = true;
			let any_checked = false;
			for (const key in this.selectedIds) {
				if (this.selectedIds.hasOwnProperty(key)) {
					const is_checked = this.selectedIds[key];
					if (is_checked === false || is_checked === undefined) {
						all_checked = false;
					} else {
						any_checked = true;
					}
				}
			}

			if (all_checked) {
				this.showBulkAction = true;
				this.checkAllCheckbox.indeterminate = false;
				this.checkAllCheckbox.checked = true;
			} else if (any_checked) {
				this.showBulkAction = true;
				this.checkAllCheckbox.indeterminate = any_checked;
			} else {
				this.showBulkAction = false;
				this.checkAllCheckbox.checked = false;
				this.checkAllCheckbox.indeterminate = false;
			}
		}
	}

	openAdd() {
		this.dialogService
			.open(EditTimeLogModalComponent)
			.onClose.pipe(untilDestroyed(this))
			.subscribe((data) => {
				if (data) {
					this.updateLogs$.next();
				}
			});
	}
	openEdit(timeLog: ITimeLog) {
		this.dialogService
			.open(EditTimeLogModalComponent, { context: { timeLog } })
			.onClose.pipe(untilDestroyed(this))
			.subscribe((data) => {
				if (data) {
					this.updateLogs$.next();
				}
			});
	}

	openView(timeLog: ITimeLog) {
		this.dialogService
			.open(ViewTimeLogModalComponent, {
				context: {
					timeLog
				},
				dialogClass: 'view-log-dialog'
			})
			.onClose.pipe(untilDestroyed(this))
			.subscribe((data) => {
				if (data) {
					this.updateLogs$.next();
				}
			});
	}

	onDeleteConfirm(log) {
		this.timesheetService.deleteLogs(log.id).then(() => {
			const index = this.timeLogs.indexOf(log);
			this.timeLogs.splice(index, 1);
		});
	}

	bulkAction(action) {
		if (action === 'Delete') {
			this.dialogService
				.open(ConfirmComponent, {
					context: {
						data: {
							message: this.translateService.instant(
								'TIMESHEET.DELETE_TIMELOG'
							)
						}
					}
				})
				.onClose.pipe(untilDestroyed(this))
				.subscribe((type) => {
					if (type === 'ok') {
						const logIds = [];
						for (const key in this.selectedIds) {
							if (this.selectedIds.hasOwnProperty(key)) {
								const is_checked = this.selectedIds[key];
								if (is_checked) {
									logIds.push(key);
								}
							}
						}
						this.timesheetService.deleteLogs(logIds).then(() => {
							this.updateLogs$.next();
						});
					}
				});
		}
	}

	ngOnDestroy() {
		this._ngDestroy$.next();
		this._ngDestroy$.complete();
	}
}
