interface S {
	// Computation constructors
	<T>(fn : (last? : T) => T, seed? : T) : () => T;

	// Data signal constructors
	data<T>(value : T) : (newvalue? : T) => T;
    sum<T>(value : T) : (update? : (value: T) => T) => T;

	// Batching changes
	freeze<T>(fn : () => T) : T;

    // Sampling a signal
    sample<T>(fn : () => T) : T;

    // Fluent options  
    orphan() : SBuilder;
    on<T>(ev : () => any, onchanges? : boolean) : SBuilder;
    defer(scheduler : (go : () => void) => () => void) : SBuilder;
        
	// Disposing computations	
	dispose<T>(fn : () => T) : T;
	
	// Freeing external resources
	cleanup(fn : (final : boolean) => any) : void;
}

interface SBuilder {
    S<T>(fn : () => T) : () => T;
    on<T>(ev : () => any, onchanges? : boolean) : SBuilder;
    defer(fn : (go : () => void) => () => void) : SBuilder;
}

interface SOptions {
	orphan : boolean;
	defer : (go : () => void) => () => void;
}

declare var S : S;
