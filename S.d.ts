interface S {
	// Computation constructor
	<T>(fn : () => T) : () => T;

	// Data signal constructors
	data<T>(value : T) : (newvalue? : T) => T;
    sum<T>(value : T) : (update? : (value: T) => T) => T;

	// Batching changes
	event<T>(fn : () => T) : T;

    // Sampling signals
    sample<T>(fn : () => T) : T;

	// Computation options
	toplevel() : SOnOption;
	on(...fns : (() => any)[]) : SAsyncOption;
	async(fn : (go : () => void) => () => void) : SOption;

	// Disposing computations	
	dispose<T>(fn : () => T) : T;
	
	// Freeing external resources
	cleanup(fn : (final : boolean) => any) : void;
}

interface SOnOption extends SAsyncOption {
	on(...fns : (() => any)[]) : SAsyncOption;
}

interface SAsyncOption extends SOption {
	async(fn : (go : () => void) => () => void) : SOption;
}

interface SOption {
	S<T>(fn : () => T) : () => T;
}

declare var S : S;
