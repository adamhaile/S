interface S {
	// Computation constructors
	<T>(fn : () => T, opts? : SOptions) : () => T;
	<T>(fn : (v : T) => T, seed : T, opts? : SOptions) : () => T;
	on<T>(ev : () => any, fn : (v? : T) => T, seed? : T, onchanges?: boolean, opts? : SOptions) : () => T;

	// Data signal constructors
	data<T>(value : T) : (value? : T) => T;
    sum<T>(value : T) : (update? : (value: T) => T) => T;

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
	orphan : boolean;
	defer : (go : () => void) => () => void;
}

declare var S : S;
