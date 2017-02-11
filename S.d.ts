interface S {
	// Computation root
	root<T>(fn : (dispose? : () => void) => T) : T;

	// Computation constructors
	<T>(fn : () => T) : () => T;
	<T>(fn : (v : T) => T, seed : T) : () => T;
	on<T>(ev : () => any, fn : () => T) : () => T;
	on<T>(ev : () => any, fn : (v : T) => T, seed : T, onchanges?: boolean) : () => T;

	// Data signal constructors
	data<T>(value : T) : S.DataSignal<T>;
	value<T>(value : T, eq? : (a : T, b : T) => boolean) : S.DataSignal<T>;
	sum<T>(value : T) : S.SumSignal<T>;

	// Batching changes
	freeze<T>(fn : () => T) : T;

	// Sampling a signal
	sample<T>(fn : () => T) : T;
	
	// Freeing external resources
	cleanup(fn : (final : boolean) => any) : void;

	// subprocesses
	process() : <T>(fn : () => T) => T;
}

declare namespace S { 
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
