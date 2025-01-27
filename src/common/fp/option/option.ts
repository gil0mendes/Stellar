import { panic } from "../runtime/executor.ts";
import { IOptionPattern, None as INone, Option, Some as ISome } from "./option.types.ts";

class Some<T> implements ISome<T> {
	public _tag = "some" as const;

	constructor(private readonly value: T) {}

	flatten(): Option<T> {
		if (this.value instanceof Some || this.value instanceof None) {
			return this.value;
		}

		return this;
	}

	zip<U>(other: Option<U>): Option<[T, U]> {
		if (other.isNone()) {
			return none<[T, U]>();
		}

		return some([this.value, other.unwrap()]);
	}
	orElse(_f: () => Option<T>): Option<T> {
		return this;
	}

	or(_: Option<T>): Option<T> {
		return this;
	}
	filter(fn: (t: T) => boolean): Option<T> {
		return fn(this.value as NonNullable<T>) ? some(this.value as NonNullable<T>) : none<T>();
	}
	andThen<U>(f: (val: NonNullable<T>) => Option<U>): Option<U> {
		return f(this.value as NonNullable<T>);
	}

	and<U>(optb: Option<U>): Option<U> {
		return optb;
	}

	unwrap(): T {
		return this.value;
	}

	unwrapOr(_val: NonNullable<T>): T {
		return this.value;
	}

	unwrapOrElse(_fn: () => NonNullable<T>): T {
		return this.value;
	}

	tap(val: Partial<IOptionPattern<T, void>>): void {
		typeof val.some === "function" && val.some(this.value as NonNullable<T>);
	}

	tapNone(_fn: () => void): void {
		// Do nothing
	}

	tapSome(fn: (val: NonNullable<T>) => void): void {
		fn(this.value as NonNullable<T>);
	}

	match<R>(pattern: IOptionPattern<T, R>): R {
		return pattern.some(this.value as NonNullable<T>);
	}

	map<R>(fn: (t: NonNullable<T>) => NonNullable<R>): Option<R> {
		const value = fn(this.value as NonNullable<T>);
		return option(value);
	}

	isSome(): boolean {
		return true;
	}

	isNone(): boolean {
		return false;
	}

	contains(x: T): boolean {
		return this.value === x;
	}
}

class None<T> implements INone<T> {
	public _tag = "none" as const;

	contains(): boolean {
		return false;
	}

	flatten(): Option<T> {
		return this;
	}

	zip<U>(): Option<[T, U]> {
		return none<[T, U]>();
	}
	orElse(f: () => Option<T>): Option<T> {
		return f();
	}

	or(optb: Option<T>): Option<T> {
		return optb;
	}

	filter(): Option<T> {
		return none<T>();
	}

	andThen<U>(): Option<U> {
		return none<U>();
	}

	and<U>(): Option<U> {
		return none<U>();
	}

	unwrap(): T {
		panic("Called unwrap on a None");
	}

	unwrapOr(val: NonNullable<T>): T {
		return val;
	}

	unwrapOrElse(fn: () => NonNullable<T>): T {
		return fn();
	}

	tap(val: Partial<IOptionPattern<T, void>>): void {
		typeof val.none === "function" && val.none();
	}

	tapNone(fn: () => void): void {
		fn();
	}

	tapSome(): void {
		// do nothing
	}

	match<R>(pattern: IOptionPattern<T, R>): R {
		return pattern.none();
	}

	map<R>(): Option<R> {
		return none<R>();
	}

	isSome(): boolean {
		return false;
	}

	isNone(): boolean {
		return true;
	}
}

/**
 * Create a new None.
 */
export function none<T>(): Option<T> {
	return new None<T>();
}

/**
 * Create a new Some.
 *
 * @param value value to be wrapped into an Option.
 */
export function some<T>(value: NonNullable<T>): Option<NonNullable<T>> {
	return new Some(value);
}

/**
 * Create a new Option.
 *
 * @param value value to be warped inside an Option.
 */
export function option<T>(value?: T): Option<T> {
	return typeof value === "undefined" || value === null ? none<T>() : some(value as NonNullable<T>);
}
