/**
 * Define a contract to unwrap Option objects.
 */
export interface IOptionPattern<TIn, TOut> {
	/**
	 * Function to handle when a value exists.
	 */
	some(val: NonNullable<TIn>): TOut;

	/**
	 * Function to handle when a value is undefined.
	 */
	none(): TOut;
}

/**
 * Interface that describes a structure to handling possibility of undefined or null values.
 */
export interface IOption<T> {
	/**
	 * Returns None if the option is None, otherwise returns optb.
	 */
	and<U>(optb: Option<U>): Option<U>;

	/**
	 * Returns None if the option is None, otherwise calls f with the wrapped value and returns the result.
	 *
	 * Some languages call this operation flatmap.
	 *
	 * @param f Function being executed when is a Some.
	 */
	andThen<U>(f: (val: NonNullable<T>) => Option<U>): Option<U>;

	/**
	 * Returns None if the option is None, otherwise calls predicate with the wrapped value and returns:
	 *
	 * - Some(t) if predicate returns true (where t is the wrapped value), and
	 * - None if predicate returns false.
	 */
	filter(fn: (t: T) => boolean): Option<T>;

	/**
	 * Converts from Option<Option<T>> to Option<T>
	 *
	 * Flattening once only removes one level of nesting. When there is no more nesting return the Option reference.
	 */
	flatten(): Option<T>;

	/**
	 * Returns the option if it contains a value, otherwise returns optb.
	 *
	 * Arguments passed to or are eagerly evaluated; if you are passing the result of a function call, it is recommended
	 * to use or_else, which is lazily evaluated.
	 *
	 * @param f optb
	 */
	or(optb: Option<T>): Option<T>;

	/**
	 * Returns the option if it contains a value, otherwise calls f and returns the result.
	 *
	 * @param f
	 */
	orElse(f: () => Option<T>): Option<T>;

	/**
	 * Zips this with another Option.
	 *
	 * If this is Some(s) and other is Some(o), this method returns Some([s, o]). Otherwise, None is returned.
	 *
	 * @param other
	 */
	zip<U>(other: Option<U>): Option<[T, U]>;

	/**
	 * Moves the value out of the Option if it is Some.
	 *
	 * In general, because this function may panic, its use is discouraged. Instead, prefer to use pattern matching and
	 * handle the None case explicitly.
	 */
	unwrap(): T;

	/**
	 * Unwrap a Option with a default value.
	 */
	unwrapOr(val: NonNullable<T>): T;

	/**
	 * Unwrap a Option with a default computed value.
	 */
	unwrapOrElse(fn: () => NonNullable<T>): T;

	/**
	 * Execute functions with side-effects.
	 */
	tap(val: Partial<IOptionPattern<T, void>>): void;

	/**
	 * Execute a function with side-effects when maybe is a none
	 */
	tapNone(fn: () => void): void;

	/**
	 * Execute a function with side-effect when maybe is a some
	 */
	tapSome(fn: (val: NonNullable<T>) => void): void;

	/**
	 * Unwrap and apply MaybePattern function
	 */
	match<R>(pattern: IOptionPattern<T, R>): R;

	/**
	 * Convert an Option<T> into Option<R> by applying a function to a contained value.
	 */
	map<R>(fn: (t: NonNullable<T>) => NonNullable<R>): Option<R>;

	/**
	 * Returns true if value is not empty
	 */
	isSome(): boolean;

	/**
	 * Return true if value is empty
	 */
	isNone(): boolean;

	/**
	 * Returns `true` if the Option is a Some value containing the given value.
	 */
	contains(x: T): boolean;
}

export interface Some<T> extends IOption<T> {
	readonly _tag: "some";
}

export interface None<T> extends IOption<T> {
	readonly _tag: "none";
}

/**
 * Type Option represents an optional value: every Option is either Some and contains a value, or None, and does not.
 */
export type Option<T> = Some<T> | None<T>;
