interface Signal<T> {
	() : T;
}

interface DataSignal<T> extends Signal<T> {
	(v : T) : T;
	toJSON : () => T;
}

interface Computation<T> extends Signal<T> {
	dispose() : void;
	toJSON : () => T;
}

interface S {
	<T>(fn : () => T) : Computation<T>;
	data<T>(v : T) : DataSignal<T>;
	on(...signals : Signal<any>[]) : ComputationBuilder;
	when(...signals : Signal<any>[]) : ComputationBuilder;
	peek<T>(fn : () => T) : T;
	freeze<T>(fn : () => T) : T;
	gate(gate : Gate) : ComputationBuilder;
	collector() : Collector;
	debounce(msecs : number) : Gate;
	throttle(msecs : number) : Gate;
	pin() : ComputationBuilder;
	pin<T>(fn : () => T) : T;
	cleanup(fn : () => void) : void;
}

interface GateToken { }

interface ComputationBuilder {
	S<T>(fn : () => T) : Computation<T>
	gate(gate : Gate) : ComputationBuilder;
	pin() : ComputationBuilder;
}

interface Gate {
	(t : GateToken) : boolean;
}

interface Collector extends Gate {
	go() : void;
}

declare var S : S;
