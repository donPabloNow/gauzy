import { Component, OnInit, OnDestroy } from '@angular/core';
import {
	IOrganizationPosition,
	ITag,
	ComponentLayoutStyleEnum
} from '@gauzy/models';
import { NbToastrService, NbDialogService } from '@nebular/theme';
import { OrganizationPositionsService } from 'apps/gauzy/src/app/@core/services/organization-positions';
import { TranslateService } from '@ngx-translate/core';
import { first } from 'rxjs/operators';
import { TranslationBaseComponent } from 'apps/gauzy/src/app/@shared/language-base/translation-base.component';
import { Store } from '../../@core/services/store.service';
import { ComponentEnum } from '../../@core/constants/layout.constants';
import { LocalDataSource } from 'ng2-smart-table';
import { NotesWithTagsComponent } from '../../@shared/table-components/notes-with-tags/notes-with-tags.component';
import { DeleteConfirmationComponent } from '../../@shared/user/forms/delete-confirmation/delete-confirmation.component';
import { untilDestroyed } from 'ngx-take-until-destroy';
@Component({
	selector: 'ga-positions',
	templateUrl: './positions.component.html'
})
export class PositionsComponent extends TranslationBaseComponent
	implements OnInit, OnDestroy {
	organizationId: string;
	showAddCard: boolean;
	positions: IOrganizationPosition[];
	selectedPosition: IOrganizationPosition;
	showEditDiv: boolean;
	positionsExist: boolean;
	tags: ITag[] = [];
	isGridEdit: boolean;
	viewComponentName: ComponentEnum;
	dataLayoutStyle = ComponentLayoutStyleEnum.TABLE;
	settingsSmartTable: object;
	smartTableSource = new LocalDataSource();
	constructor(
		private readonly organizationPositionsService: OrganizationPositionsService,
		private readonly toastrService: NbToastrService,
		private readonly store: Store,
		private dialogService: NbDialogService,
		readonly translateService: TranslateService
	) {
		super(translateService);
		this.setView();
	}
	ngOnInit(): void {
		this.store.selectedOrganization$
			.pipe(untilDestroyed(this))
			.subscribe((organization) => {
				if (organization) {
					this.organizationId = organization.id;
					this.loadPositions();
					this.loadSmartTable();
					this._applyTranslationOnSmartTable();
				}
			});
	}

	ngOnDestroy(): void {}

	async loadSmartTable() {
		this.settingsSmartTable = {
			actions: false,
			columns: {
				name: {
					title: this.getTranslation('ORGANIZATIONS_PAGE.NAME'),
					type: 'custom',
					class: 'align-row',
					renderComponent: NotesWithTagsComponent
				}
			}
		};
	}
	async removePosition(id: string, name: string) {
		const result = await this.dialogService
			.open(DeleteConfirmationComponent, {
				context: {
					recordType: 'Employee Position'
				}
			})
			.onClose.pipe(first())
			.toPromise();

		if (result) {
			await this.organizationPositionsService.delete(id);

			this.toastrService.primary(
				this.getTranslation(
					'NOTES.ORGANIZATIONS.EDIT_ORGANIZATIONS_POSITIONS.REMOVE_POSITION',
					{
						name: name
					}
				),
				this.getTranslation('TOASTR.TITLE.SUCCESS')
			);

			this.loadPositions();
		}
	}
	edit(position: IOrganizationPosition) {
		this.showAddCard = true;
		this.isGridEdit = true;
		this.selectedPosition = position;
		this.tags = position.tags;
	}
	setView() {
		this.viewComponentName = ComponentEnum.POSITIONS;
		this.store
			.componentLayout$(this.viewComponentName)
			.pipe(untilDestroyed(this))
			.subscribe((componentLayout) => {
				this.dataLayoutStyle = componentLayout;
				this.selectedPosition = null;

				//when layout selector change then hide edit showcard
				this.showAddCard = false;
			});
	}
	save(name: string) {
		if (this.isGridEdit) {
			this.editPosition(this.selectedPosition.id, name);
		} else {
			this.addPosition(name);
		}
	}
	async editPosition(id: string, name: string) {
		await this.organizationPositionsService.update(id, {
			name: name,
			tags: this.tags
		});
		this.loadPositions();
		this.toastrService.success('Successfully updated');
		this.cancel();
	}
	private async addPosition(name: string) {
		if (name) {
			await this.organizationPositionsService.create({
				name,
				organizationId: this.organizationId,
				tags: this.tags
			});

			this.toastrService.primary(
				this.getTranslation(
					'NOTES.ORGANIZATIONS.EDIT_ORGANIZATIONS_POSITIONS.ADD_POSITION',
					{
						name: name
					}
				),
				this.getTranslation('TOASTR.TITLE.SUCCESS')
			);

			this.loadPositions();
			this.cancel();
		} else {
			// TODO translate
			this.toastrService.danger(
				this.getTranslation(
					'NOTES.ORGANIZATIONS.EDIT_ORGANIZATIONS_POSITIONS.INVALID_POSITION_NAME'
				),
				this.getTranslation(
					'TOASTR.MESSAGE.NEW_ORGANIZATION_POSITION_INVALID_NAME'
				)
			);
		}
	}
	cancel() {
		this.showEditDiv = false;
		this.showAddCard = false;
		this.selectedPosition = null;
		this.isGridEdit = false;
		this.tags = [];
	}
	showEditCard(position: IOrganizationPosition) {
		this.tags = position.tags;
		this.showEditDiv = true;
		this.selectedPosition = position;
	}

	private async loadPositions() {
		const res = await this.organizationPositionsService.getAll(
			{
				organizationId: this.organizationId
			},
			['tags']
		);
		if (res) {
			this.positions = res.items;
			this.smartTableSource.load(res.items);

			if (this.positions.length <= 0) {
				this.positionsExist = false;
			} else {
				this.positionsExist = true;
			}

			this.emptyListInvoke();
		}
	}
	selectedTagsEvent(ev) {
		this.tags = ev;
	}
	_applyTranslationOnSmartTable() {
		this.translateService.onLangChange
			.pipe(untilDestroyed(this))
			.subscribe(() => {
				this.loadSmartTable();
			});
	}

	/*
	 * if empty employment levels then displayed add button
	 */
	private emptyListInvoke() {
		if (this.positions.length === 0) {
			this.cancel();
		}
	}
}
