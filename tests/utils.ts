import { API } from "../src/common/types/api.types.ts";

/**
 * This is a temporary function util to run an action and return a promise.
 */
export function runActionPromise<T>(api: API, actionName: string, params = {}): Promise<T> {
	return api.helpers.runAction(actionName, params);
}
