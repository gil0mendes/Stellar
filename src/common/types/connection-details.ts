export type ConnectionDetails<C> = {
	/**
	 * Connection type.
	 */
	type: string;

	/**
	 * Unique connection identifier.
	 */
	id: string;

	/**
	 * Connection fingerprint.
	 *
	 * This is used to uniquely identify connections.
	 */
	fingerprint?: string;

	/**
	 * Remote connection port.
	 */
	remotePort: number;

	/**
	 * Remote connection string.
	 */
	remoteHostname: string;

	/**
	 * Generic connection details.
	 */
	rawConnection: C;

	/**
	 * Flag to know if the connection supports chat.
	 */
	canChat: boolean;

	/**
	 * Number of sent messages by this connection.
	 */
	messageCount: number;

	respondingTo?: unknown;

	/**
	 * Response object to sent to the client.
	 */
	response?: unknown;

	/**
	 * Number of pending actions that are waiting by a response.
	 */
	pendingActions?: number;

	/**
	 * Dictionary with the request parameters.
	 */
	params: Record<string, unknown>;

	/**
	 * Used file extension when doing file requests.
	 */
	extension?: string;

	/**
	 * Error that occurs during the request processing.
	 */
	error?: Error;

	/**
	 * Destroy method.
	 */
	destroy?: () => void;

	/**
	 * Execute a verb for this connection.
	 */
	verbs?: (verb: string, words: Array<string>) => Promise<unknown>;
};
