import { CreateTimeSlotHandler } from './create-time-slot.handler';
import { UpdateTimeSlotHandler } from './update-time-slot.handler';
import { CreateTimeSlotMinutesHandler } from './create-time-slot-minutes.handler';
import { UpdateTimeSlotMinutesHandler } from './update-time-slot-minutes.handler';
import { TimeSlotBulkCreateOrUpdateHandler } from './time-slot-bulk-create-or-update.handler';
import { TimeSlotBulkCreateHandler } from './time-slot-bulk-create.handler';
import { DeleteTimeSlotHandler } from './delete-time-slot.handler';
import { TimeSlotRangeDeleteHandler } from './time-slot-range-delete.handler';

export const TimeSlotCommandHandlers = [
	CreateTimeSlotHandler,
	UpdateTimeSlotHandler,
	DeleteTimeSlotHandler,
	TimeSlotBulkCreateOrUpdateHandler,
	TimeSlotBulkCreateHandler,
	CreateTimeSlotMinutesHandler,
	UpdateTimeSlotMinutesHandler,
	TimeSlotRangeDeleteHandler
];
