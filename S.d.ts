interface S {
	// Computation constructors
	<T>(fn : () => T) : () => T;
	<T>(fn : (v : T) => T, seed : T) : () => T;
	<T, U>(fn : (v : T, s : U) => T, seed : T, state : U) : () => T;
	on<T>(ev : (() => any) | (() => any)[], fn : () => T) : () => T;
	on<T>(ev : (() => any) | (() => any)[], fn : (v : T) => T, seed : T) : () => T;
	on<T, U>(ev : (() => any) | (() => any)[], fn : (v : T, s : U) => T, seed : T, state : U) : () => T;

	// Data signal constructors
	data<T>(value : T) : (newvalue? : T) => T;
    sum<T>(value : T) : (update? : (value: T) => T) => T;

	// Batching changes
	event<T>(fn : () => T) : T;

    // Sampling signals
    sample<T>(fn : () => T) : T;
    
    // Computation options
    toplevel() : SAsyncOption;
    async(fn : (go : () => void) => () => void) : SOption;
        
	// Disposing computations	
	dispose<T>(fn : () => T) : T;
	
	// Freeing external resources
	cleanup(fn : (final : boolean) => any) : void;
}

interface SAsyncOption extends SOption {
    async(fn : (go : () => void) => () => void) : SOption;
}

interface SOption {
    S<T>(fn : () => T, seed? : T, state? : any) : () => T;
	on<T>(ev : (() => any) | (() => any)[], fn : (v : T) => T, seed? : T, state? : any) : () => T;
}

declare var S : S;
