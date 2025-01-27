import { Connection } from "../../connection.ts";

export type ActionStatus = "unknown_action" | "missing_params" | "server_error";

export type ActionParams = Record<string, unknown> & {
	/**
	 * Name of the action being executed.
	 */
	action: string;

	/**
	 * Version of the action being executed.
	 */
	apiVersion: number;
};

export type ServerInformation = {
	serverName: string;
	apiVersion: string;
	requestDuration: number;
	currentTime: number;
};

export type RequesterInformation = {
	id: string;
	fingerprint: string;
	remoteHostname: string;
	receivedParams: Record<string, unknown>;
};

export type ActionProcessor<C> = {
	/**
	 * Connection instance.
	 */
	connection: Connection<C>;

	/**
	 * Action name
	 */
	action: string;

	/**
	 * Informs if the response needs to be rendered and sent to the client.
	 */
	toRender: boolean;

	/**
	 * Current action status.
	 */
	actionStatus: ActionStatus;

	/**
	 * Action parameters.
	 */
	params: ActionParams;

	response: {
		serverInformation: ServerInformation;
		requesterInformation: RequesterInformation;
		// TODO: find the right
		error?: unknown;
	};
};
