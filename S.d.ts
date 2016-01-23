interface S {
	// Computation constructor
	<T>(fn : () => T, options? : SOptions) : () => T;

	// Data signal constructors
	data<T>(value : T) : (newvalue? : T) => T;
    sum<T>(value : T) : (update? : (value: T) => T) => T;

    // Reducer constructor
	on<T>(ev : (() => any) | (() => any)[], fn : (v : T) => T, seed : T, options? : SOptions) : () => T;

	// Batching changes
	event<T>(fn : () => T) : T;

    // Sampling signals
    sample<T>(fn : () => T) : T;

	// Disposing computations	
	dispose<T>(fn : () => T) : T;
	
	// Freeing external resources
	cleanup(fn : (final : boolean) => any) : void;
}

interface SOptions {
    async?: (go : () => void) => () => void,
    toplevel? : boolean
}

declare var S : S;
