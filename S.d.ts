interface S {
	// Computation constructors
	<T>(fn : () => T) : () => T;
	<T>(fn : (v : T) => T, seed : T) : () => T;
	on<T>(ev : () => any, fn : () => T) : () => T;
	on<T>(ev : () => any, fn : (v : T) => T, seed : T, onchanges?: boolean) : () => T;

	// Data signal constructors
	data<T>(value : T) : S.DataSignal<T>;
	value<T>(value : T, eq? : (a : T, b : T) => boolean) : S.DataSignal<T>;
	sum<T>(value : T) : S.SumSignal<T>;

	// Computation options  
	orphan() : S.Options;
	defer(scheduler : (go : () => void) => () => void) : S.Options;

	// Batching changes
	freeze<T>(fn : () => T) : T;

	// Sampling a signal
	sample<T>(fn : () => T) : T;

	// Disposing computations	
	dispose<T>(fn : () => T) : T;
	
	// Freeing external resources
	cleanup(fn : (final : boolean) => any) : void;
}

declare namespace S { 
	interface Options {
		S<T>(fn : () => T) : () => T;
		S<T>(fn : (v : T) => T, seed : T) : () => T;
		on<T>(ev : () => any, fn : () => T) : () => T;
		on<T>(ev : () => any, fn : (v : T) => T, seed : T, onchanges?: boolean) : () => T;
		
		defer(fn : (go : () => void) => () => void) : Options;
	}

	interface DataSignal<T> {
		() : T;
		(val : T) : T;
	}

	interface SumSignal<T> {
		() : T;
		(update? : (value: T) => T) : T;
	}
}

declare var S : S;

//export = S;
