type NotificationPayload = {
    state: true;
    level?: 'error' | 'warning' | 'info';
} | {
    state: false;
};
type AppStatePayload = {
    state: boolean;
};
type AppToggledEvent = (opts: {
    state: boolean;
}) => void;
type ToolbarPlacementUpdatedEvent = (opts: {
    placement: 'bottom-left' | 'bottom-center' | 'bottom-right';
}) => void;
export declare class ToolbarAppEventTarget extends EventTarget {
    constructor();
    /**
     * Toggle the notification state of the toolbar
     * @param options - The notification options
     * @param options.state - The state of the notification
     * @param options.level - The level of the notification, optional when state is false
     */
    toggleNotification(options: NotificationPayload): void;
    /**
     * Toggle the app state on or off
     * @param options - The app state options
     * @param options.state - The new state of the app
     */
    toggleState(options: AppStatePayload): void;
    /**
     * Fired when the app is toggled on or off
     * @param callback - The callback to run when the event is fired, takes an object with the new state
     */
    onToggled(callback: AppToggledEvent): void;
    /**
     * Fired when the toolbar placement is updated by the user
     * @param callback - The callback to run when the event is fired, takes an object with the new placement
     */
    onToolbarPlacementUpdated(callback: ToolbarPlacementUpdatedEvent): void;
}
export declare const serverHelpers: {
    /**
     * Send a message to the server, the payload can be any serializable data.
     *
     * The server can listen for this message in the `astro:server:config` hook of an Astro integration, using the `toolbar.on` method.
     *
     * @param event - The event name
     * @param payload - The payload to send
     */
    send: <T>(event: string, payload: T) => void;
    /**
     * Receive a message from the server.
     * @param event - The event name
     * @param callback - The callback to run when the event is received.
     * The payload's content will be passed to the callback as an argument
     */
    on: <T>(event: string, callback: (data: T) => void) => void;
};
export type ToolbarServerHelpers = typeof serverHelpers;
export {};
