interface Signal<T> {
	() : T;
	toJSON : () => T;
}

interface DataSignal<T> extends Signal<T> {
	(v : T) : T;
}

interface Formula<T> extends Signal<T> {
	dispose() : void;
}

interface S {
	<T>(fn : () => T) : Formula<T>;
	data<T>(v : T) : DataSignal<T>;
	on(...signals : Signal<any>[]) : FormulaOptions;
	when(...signals : Signal<any>[]) : FormulaOptions;
	peek<T>(fn : () => T) : T;
	freeze<T>(fn : () => T) : T;
	gate(gate : Gate) : FormulaOptions;
	collector() : Collector;
	debounce(t : number) : Gate;
	throttle(t : number) : Gate;
	pin() : FormulaOptions;
	cleanup(fn : () => void) : void;
}

interface GateToken { }

interface FormulaOptions {
	S<T>(fn : () => T) : Formula<T>
	gate(gate : Gate) : FormulaOptions;
	pin() : FormulaOptions;
}

interface Gate {
	(t : GateToken) : boolean;
}

interface Collector extends Gate {
	go() : void;
}

declare var S : S;