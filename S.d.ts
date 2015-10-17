
interface S {
	// Computation constructor
	<T>(fn : () => T) : () => T;
	<T>(fn : (self : () => T) => T) : () => T;

	// Data signal constructor
	data<T>(value : T) : (newvalue? : T) => T;
	sum<T>(value : T) : (updater? : (value: T) => T) => T;

	// Controlling dependencies
	watch(...signals : (() => void)[]) : ComputationBuilder;
	peek<T>(fn : () => T) : T;

	// Controlling propagation granularity
	freeze<T>(fn : () => T) : T;

	// Computation lifespan
	pin(signal : () => void) : ComputationBuilder;
	dispose(signal : () => void) : void;

	// Scheduling
	async(fn : (go : () => void) => void | (() => void)) : ComputationBuilder;

	// Resource cleanup
	cleanup(fn : () => void) : void;
}

interface ComputationBuilder {
	S<T>(fn : (self? : () => T) => T) : () => T
	async(fn : (go : () => void) => () => void) : ComputationBuilder;
	pin(signal : () => void) : ComputationBuilder;
}

declare var S : S;
