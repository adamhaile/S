interface Signal<T> {
	() : T;
}

interface DataSignal<T> extends Signal<T> {
	(v : T) : T;
}

interface S {
	<T>(fn : () => T) : Signal<T>;
	<T>(fn : (dispose : () => void) => T) : Signal<T>;
	data<T>(v : T) : DataSignal<T>;
	on(...signals : Signal<any>[]) : ComputationBuilder;
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

interface ComputationBuilder {
	S<T>(fn : () => T) : Signal<T>;
	S<T>(fn : (dispose : () => void) => T) : Signal<T>
	gate(gate : Gate) : ComputationBuilder;
	pin() : ComputationBuilder;
}

interface GateToken { }

interface Gate {
	(t : GateToken) : boolean;
}

interface Collector extends Gate {
	go() : void;
}

declare var S : S;
