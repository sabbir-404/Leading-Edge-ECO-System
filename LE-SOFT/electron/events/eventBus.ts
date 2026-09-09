import { EventEmitter } from 'events';

/**
 * eventBus.ts — Decoupled Event Bus Layer for LE-SOFT ERP
 * Publishes and subscribes to real-time system transactions.
 */

export type ErpEventType =
    | 'InvoiceCreated'
    | 'InvoiceAltered'
    | 'StockChanged'
    | 'VoucherPosted'
    | 'RequisitionCreated'
    | 'RequisitionStatusChanged'
    | 'MakeOrderCreated'
    | 'MakeOrderStatusChanged';

export interface ErpEventPayload {
    eventType: ErpEventType;
    entityId: string | number;
    payload: any;
    timestamp: string;
    triggeredBy?: string;
}

class ErpEventBus extends EventEmitter {
    publish(eventType: ErpEventType, entityId: string | number, payload: any, triggeredBy = 'System') {
        const event: ErpEventPayload = {
            eventType,
            entityId,
            payload,
            timestamp: new Date().toISOString(),
            triggeredBy,
        };
        console.log(`[EventBus] Emitting event: ${eventType} (ID: ${entityId})`);
        this.emit(eventType, event);
        this.emit('*', event);
    }

    subscribe(eventType: ErpEventType | '*', callback: (event: ErpEventPayload) => void) {
        this.on(eventType, callback);
        return () => this.off(eventType, callback);
    }
}

export const eventBus = new ErpEventBus();
