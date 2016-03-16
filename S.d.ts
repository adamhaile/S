interface S {
	// Computation constructors
	<T>(fn : () => T) : () => T;
    on<T>(ev : () => any, fn : (v? : T) => T, seed? : T);

	// Data signal constructors
	data<T>(value : T) : (newvalue? : T) => T;
    sum<T>(value : T) : (update? : (value: T) => T) => T;

	// Batching changes
	event<T>(fn : () => T) : T;

    // Sampling a signal
    sample<T>(fn : () => T) : T;

    // Fluent options    
    orphan() : SBuilder;
    async(scheduler : (go : () => void) => () => void) : SBuilder;
        
	// Disposing computations	
	dispose<T>(fn : () => T) : T;
	
	// Freeing external resources
	cleanup(fn : (final : boolean) => any) : void;
}

interface SBuilder {
    S<T>(fn : () => T) : () => T;
    on<T>(ev : () => any, fn : (v? : T) => T, seed? : T) : () => T;
    async(fn : (go : () => void) => () => void) : SBuilder;
}

declare var S : S;
