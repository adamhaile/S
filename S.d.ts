interface S {
	// Computation constructors
	<T>(fn : () => T) : () => T;
	<T>(fn : (v : T) => T, seed : T) : () => T;
	on<T>(ev : () => any, fn : () => T) : () => T;
	on<T>(ev : () => any, fn : (v : T) => T, seed : T, onchanges?: boolean) : () => T;

	// Data signal constructors
	data<T>(value : T) : (value? : T) => T;
    sum<T>(value : T) : (update? : (value: T) => T) => T;

	// Computation options  
    orphan() : SOptions;
    defer(scheduler : (go : () => void) => () => void) : SOptions;

	// Batching changes
	freeze<T>(fn : () => T) : T;

    // Sampling a signal
    sample<T>(fn : () => T) : T;

	// Disposing computations	
	dispose<T>(fn : () => T) : T;
	
	// Freeing external resources
	cleanup(fn : (final : boolean) => any) : void;
}

interface SOptions {
    S<T>(fn : () => T) : () => T;
	S<T>(fn : (v : T) => T, seed : T) : () => T;
	on<T>(ev : () => any, fn : () => T) : () => T;
	on<T>(ev : () => any, fn : (v : T) => T, seed : T, onchanges?: boolean) : () => T;
	
    defer(fn : (go : () => void) => () => void) : SOptions;
}

declare var S : S;
