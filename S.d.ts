interface S {
	// Computation constructors
	<T>(fn : () => T) : () => T;
    on<T>(ev : () => any, fn : () => T) : () => T;
    on<T>(ev : () => any, fn : (v : T) => T, seed : T);
    on<T, U>(ev : () => any, fn : (v : T, s : U) => T, seed : T, state : U);

	// Data signal constructors
	data<T>(value : T) : (newvalue? : T) => T;
    sum<T>(value : T) : (update? : (value: T) => T) => T;

	// Batching changes
	event<T>(fn : () => T) : T;

    // Sampling signals
    sample<T>(fn : () => T) : T;
    hold() : {};
    trait<T>(mod : (fn : () => T) => () => T) : (fn : () => T) => () => T;
    toplevel<T>(fn : () => T) : () => T;
    
    async<T>(scheduler : (go : () => void) => () => void) : (fn : () => T) => () => T;
        
	// Disposing computations	
	dispose<T>(fn : () => T) : T;
	
	// Freeing external resources
	cleanup(fn : (final : boolean) => any) : void;
}

declare var S : S;
