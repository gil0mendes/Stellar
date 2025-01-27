/**
 * Panic with an error.
 *
 * The use of this functions isn't recommenced since this can lead to the program to die. Instead it's recommended to
 * use a Result monad to return an error.
 */
export function panic(error: string | Error): never {
	throw error instanceof Error ? error : Error(error);
}
