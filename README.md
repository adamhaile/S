# S.js

S.js is a small library for performing **simple, clean, fast reactive programming** in Javascript.  It aims for a simple mental model, a clean and expressive syntax, and fast execution.  

In plain terms, S helps you **keep things up-to-date** in your program.  S programs work like a spreadsheet: when data changes, S automatically updates downstream computations.

Here's a tiny example:
```javascript
var a = S.data(1),                   //       a() |   1     3     3     5       
    b = S.data(2),                   //       b() |   2     2     4     6 
    c = S(() => a() + b()),          //       c() |   3     5     7    11 
    d = S(() => c() * a()); // t0    //       d() |   3    15    21    55  
a(3);                       // t1    //           +------------------------> 
b(4);                       // t2    //              t0    t1    t2    t3
S.freeze(() => {                     //    
    a(5);                            //    
    b(6);                            //    
});                         // t3    //    
```
The timeline on the right shows how the values evolve at each instant.  Initially (time t0), `c()` and `d()` are 3, but when `a()` changes to 3 (t1), they become 5 and 15.  Ditto for t2 and t3.  Every time `a()` or `b()` changes, S re-evaluates `c()` and `d()` to make sure they stay consistent.

To achieve this behavior, static data and computations must be converted to *signals*, which is a reactive term for a value that changes over time.  S data signals are constructed by `S.data(<value>)` and computations by `S(() => <code>)`.  Both return closures: call a signal to read its current value; pass a data signal a new value to change it.

When an S computation runs, S records what signals it references, thereby creating a live dependency graph of running code.  When data changes, S uses that graph to figure out what needs to be updated and in what order.

S has a small API.  The example above shows `S.freeze()`, which aggregates multiple changes into a single step (t3).  The full API is listed below.

## S Features

S maintains a few useful behaviors while it runs.  These features are designed to make it easier to reason about reactive programming:

> **Automatic Dependencies** - No manual (un)subscription to change events.  Dependencies in S are automatic and exact.
>
> **Guaranteed Currency** - No need to worry about how change propagates through the system.  S insures that signals always return current and updated values.
>
> **Exact Updates** - No missed or redundant updates.  Computations run exactly once per upstream change event.
>
> **A Unified Global Timeline** - No confusing nested or overlapping mutations from different sections of code. S apps advance through a series of discrete "instants" during which state is immutable.
>
> **Self-Extensible** - Computations can extend the system by creating new "child" computations.
>
> **Automatic Disposals** - No manual disposal of stale computations.  "Child" computations are disposed automatically when their "parent" updates.

For advanced cases, S provides capabilities for dealing with self-mutating code:

> **Multi-Step Updates** - Computations can set data signals during their execution.  These changes don't take effect until the current "instant" finishes, resulting in a multi-step update.
>
> **Partitionable Time** - Multi-step updates can run on a 'subclock,' meaning that surrounding code will only respond to final, at-rest values, not intermediate ones.

## An Example: TodoMVC in S (plus friends)
What else, right?  S is just a core library for dealing with change; it takes more to build an application.  This example uses Surplus.js, aka "S plus" a few companion libraries.  Most notably, it uses Surplus' JSX preprocessor for embedded DOM construction.
```jsx
var Todo = t => ({               // our Todo constructor
       title: S.data(t.title),   // properties are data signals
       done: S.data(t.done)
    }),
    todos = SArray([]),          // our array of todos
    newTitle = S.data(""),       // title for new todos
    addTodo = () => {            // push new title onto list
       todos.push(Todo({ title: newTitle(), done: false }));
       newTitle("");             // clear new title
    },
    view = S.root(() =>          // declarative main view
       <div>                     
          <h2>Minimalist ToDos in Surplus</h2>
          <input type="text" fn={data(newTitle)}/>
          <a onClick={addTodo}> + </a>
          {todos.map(todo =>     // insert todo views
             <div>
                <input type="checkbox" fn={data(todo.done)}/>
                <input type="text" fn={data(todo.title)}/>
                <a onClick={() => todos.remove(todo)}>&times;</a>
             </div>)}
       </div>);

document.body.appendChild(view); // add view to document
```
Run on [CodePen](https://codepen.io/adamhaile/pen/ppvdGa?editors=0010).

Some things to note:

- There's no code to handle updating the application.  Other than a liberal sprinkling of `()'s`, this could be static code.  In the lingo, S enables declarative programming, where we focus on defining how things should be and S handles updating the app from one state to the next as our data changes.

- The Surplus library leverages S computations to construct the dynamic parts of the view (the '{ ... }' expressions).  Whenever our data changes, S updates the affected parts of the DOM automatically.  

- S handles updates in as efficient a manner as possible: Surplus apps generally place at or near the top of the various web framework benchmarks (ToDoMVC, dbmonster, js-framework-benchmark, etc).

Reactive programs also have the benefit of an open structure that enables extensibility.  For instance, we can add localStorage persistence with no changes to the code above and only a handful of new lines:

```javascript
if (localStorage.todos) // load stored todos on start
    todos(JSON.parse(localStorage.todos).map(Todo));
S(() =>                 // store todos whenever they change
    localStorage.todos = JSON.stringify(todos().map(t => 
        ({ title: t.title(), done: t.done() })));
```

## API

## Data Signals

### `S.data(<value>)`
Construct a data signal whose initial value is `<value>`.  Read the current value of the data signal by calling it, set the next value by passing in a new one:

```javascript
var name = S.data("sue");
name(); // returns "sue"
name("emily") // sets name() to "emily" and returns "emily"
```

Note that you are setting the **next** value: if you set a data signal in a context where time is frozen, like in an `S.freeze()` or a computation body, then your change will not take effect until time advances.  This is because of S's unified global timeline of atomic instants: if your change took effect immediately, then there would be a before and after the change, breaking the instant in two:

```javascript
var name = S.data("sue");
S.freeze(() => {
    name("mary"); // *schedules* next value of "mary" and returns "mary"
    name(); // still returns "sue"
});
name(); // now returns "mary";
```

Most of the time, you are setting a data signal at top level (outside a computation or freeze), so the system immediately advances to account for the change.

It is an error to schedule two different next values for a data signal (where "different" is determined by `!==`):

```javascript
var name = S.data("sue");
S.freeze(() => {
    name("sue");
    name("sue"); // OK, "sue" === "sue"
    name("mary"); // EXCEPTION: conflicting changes: "sue" !== "mary"
});
```

Data signals created by `S.data()` *always* fire a change event when set, even if the new value is the same as the old:

```javascript
var name = S.data("sue"),
    counter = S.on(name, c => c + 1, 0);
counter(); // returns 1 to start
name("sue"); // fire three change events, all with same value
name("sue");
name("sue");
counter(); // now returns 4
```

### `S.value(<value>)`

`S.value()` is just like `S.data()`, except that it *does not* fire a change event when set to the same value.  It tells S "only the value of this data signal is important, not the set event."

```javascript
var name = S.value("sue"),
    counter = S.on(name, c => c + 1, 0);
counter(); // returns 1 to start
name("sue"); // set to the same value
counter(); // still returns 1, name() value didn't change
```

The default comparator is `===`, but you can pass in a custom one as a second parameter if something else is more appropriate:

```javascript
var user = S.value(sue, (a, b) => a.userId === b.userId);
```

## Computations

### `S(() => <code>)`
Construct a computation whose value is the result of the given `<code>`.  

S runs the supplied function immediately, and as it runs, S automatically monitors any signals that it reads.  To S, your function looks like:
```javascript
S(() => {
        ... foo() ...
    ... bar() ...
       ... bleck() ... zog() ...
});
```
If any of those signals change, S schedules the computation to be re-run.

The referenced signals don't need to be in the lexical body of the function: they might be in a function called from your computation.  All that matters is that evaluating the computation caused them to be read.  Similarly, signals that aren't read due to conditional branches aren't recorded.  This is true even if prior executions went down a different branch and did read them: only the last run matters, because only those signals were involved in creating the current value.

If some of those signals are computations, S guarantees that they will always return a current value.  You'll never get a "stale" value, one that is affected by an upstream change but hasn't been updated yet.  To your function, the world is always temporally consistent.

S also guarantees that, no matter how many changed data signals are upstream of your function and no matter how many paths there are through the graph from them to your function, it will only run once per update.

Together, these two qualities make S "glitchless" (named after [this scene from The Matrix](https://www.youtube.com/watch?v=z_KmNZNT5xw)): you'll never experience the same moment twice (redundant updates of a computation) or two moments at once (stale and current values in the same update).

### Not Just Pure Functions

The functions passed to S don't have to be pure (i.e. no side-effects).  For instance, we can log all changes to `name()` like so:
```javascript
S(() => console.log(name());
```
Every time `name()` changes, this will re-run and re-log the value to the console.

In a sense, this expands the idea of what the 'value' of the computation is to include the side-effects it performs.

Tip: `S.cleanup()` and `S.on()` can be useful utilities when writing computations that perform side-effects.  The first can help make your computations idempotent (a nice property for effectful computations), while the second can help make it clear when they run.

### ... And Maybe Not Pure Functions

Ask yourself: if a pure computation isn't called in your app, does it need to run?  

The S constructor is symmetric: it takes a paramless function that returns a value, and it returns a paramless function that returns the same value.  The only difference is *when* that function runs.  Without S, it runs once per call.  With S, it runs once per change.  

While S computations are designed to have minimal overhead, the cost isn't zero, and it may be faster and/or clearer to leave some lambdas plain.  Any computations which call them will "see through" to any signals they reference, so they'll still be reactive.

### Computations Creating Computations

S allows computations to expand the system with more computations.  

```javascript
var isLogging = S.value(true);
S(() => {
    if (isLogging()) {
        S(() => console.log(foo()));
        S(() => console.log(bar()));
        S(() => console.log(bleck()));
    }
});
```

In this example, the outer 'parent' or 'constructor' computation defines when we should be logging, while the inner 'child' computations are each responsible for logging a single signal.

Two important facts:
1. The outer computation only depends on the signals it itself reads, in this case just `isLogging()`, while the inner ones only depend on their single signal.
2. The inner computations are automatically disposed when the parent updates.  They can be thought of as part of the computation's 'value' and, like that value, only last until the next execution.

So if `isLogging()` changes to `false`, the outer computations re-runs, causing the inners to be disposed, and since they're not re-created, we stop logging.

This same pattern allows an entire web application to be built without any dispose(), unsubscribe() or ...DidUnmount() handlers.  A single `route()` data signal may drive a `router()` computation which constructs the current view, including all the computations that make the view dynamic.  When the `route()` changes, all those computations are guaranteed to be disposed automatically.

For special cases where you do want manual control of computations' lifetimes, see `S.root()`.

### Reducing Computations

### `S(val => <code>, <seed>)`
Construct a reducing computation, whose new value is derived from the last one, staring with `<seed>`.

This alternate call signature for `S()` is used when the value of a computation depends on its previous one. 

```javascript
var sumFoo = S(sum => sum + foo(), 0);
```

### Static Dependencies

### `S.on(<signal>, val => <code>, <seed>, <onchanges>)`
Statically declare a computation's dependencies, rather than relying on S's automatic dependency detection. 

`<seed>` is optional, with default `undefined`.

`<onchanges>` is optional and defaults to `false`.  If `<onchanges>` is true, then the initial run is skipped (i.e. computation starts with value `<seed>` and doesn't run `<code>` until a change occurs).

`<signal>` may be an array, in which case dependencies are created for each signal in the array.

Most of the time, S's automatic dependency detection is what you want, but there are always exceptions, and `S.on()` lets you statically declare which signals a computation watches.

`S.on()` is useful when:
1. it's the event, not the value of a signal that's important, `S.on()` makes that clear.
2. it's syntactically cleaner than lots of `S.sample()` calls.

Note that, unlike in some other libraries, `S.on()` does not change the parameters a function receives, only when it runs.  Besides the first `<seed>` and last `<onchanges>` paramters, `S.on()` is identical to `S()`.

### Computation Roots

### `S.root(dispose => <code>)`
Computations created by `<code>` live until `dispose` is called.  S will log a warning if you try to construct a computation that is not under a root or parent computation.

```javascript
// assume this is top-level code, not in a computation
var foo = S(() => bar() + bleck()); // causes console warning
S.root(() => {
    var foo = S(() => bar() + bleck()); // no warning
})
```

As mentioned above, most computations in an S app are child computations, and their lifetimes are controlled by their parents.  But there are two exceptions:

1. True top-level computations, like the `router()` mentioned above, are not under any parent.
2. In certain corner cases, we may want computations to outlive their parentss update cycles.

For the first case, `S.root()` tells S that we really did mean for these computations to be top-level, and so no error is logged.

For the second case, `S.root()` lets the computations escape their parents.  They are 'orphaned' and will live until we call the `dispose` function.

## Utilities

### Freezing The Clock To Apply Multiple Updates

### `S.freeze(() => <code>)`
Run `<code>`, but hold any data changes it produces in a pending state until it completes, at which point they all run as a single update.  If called within a computation, the system is already frozen, so `freeze` is inert.  Returns value of `<code>`.

This is also called a 'transaction' or 'changeset' in some other reactive libraries.

Data signals represent information coming from 'the outside': maybe the user, or a server response, or some other external source of information.  Sometimes these updates include new data for multiple data signals.  If we were to apply these changes one at a time, it a) might be inefficient, as the system would update for each single change, and b) might include states that never existed in the external system and don't make sense, when only a portion of the changes have been applied.

`S.freeze()` 'freezes' the clock and lets us batch changes so that they all run as a single update.

```javascript
var foo = S.data(1),
    bar = S.data(2);
S.freeze(() => {
    foo(3); // schedule two changes to run together
    bar(4);
    foo(), bar(); // still returns 1 and 2, as change hasn't been applied yet!
});
foo(), bar(); // now returns 3 and 4
```

Note that inside a computation, time is already frozen, due to the global atomic timeline, so in that context `S.freeze()` is inert.

### Sampling Signals To Avoid Dependencies

### `S.sample(<signal>)`
Sample the current value of `<signal>` but don't create a dependency on it.

In most cases, if we read a signal, then it matters to our computation and our computation should be re-run if the signal changes.  But there are cases where we want to tell S "due to changes in other signals, I know I want the current value of this signal, but I don't care if it changes."

For instance, say we wanted to increment `bar()` whenever `foo()` turns true.  We *do not* want to do it like this:

```javascript
S(() => { if (foo()) bar(bar() + 1); });
```

That code both reads and sets bar, meaning it immediately invalidates itself and has to run again ... and again ... and again, until S throws an exception and tells us we have a runaway mutation.

Instead, we want to do:

```javascript
S(() => { if (foo()) bar(S.sample(bar) + 1); });
```

That says "when `foo()` turns true, make `bar()` one more than its value at the time `foo()` changed."  It only runs once, as `bar()` is no longer an invalidator.

Note that in many cases, it may be clearer to use `S.on()` than `S.sample()` to accomplish the same effect (`S.on()` is built on `S.sample()`):

```javascript
S.on(foo, () => { if (foo()) bar(bar() + 1); });
```

Here, we don't need to sample `bar()`, as `S.on()` already limits our dependencies to just `foo()`.

### Cleaning Up Stale Side-Effects

### `S.cleanup(final => <code>)`
Run the given function just before the enclosing computation updates or is disposed.  The function receives a boolean parameter indicating whether this is the "final" cleanup, with `true` meaning the computation is being disposed, `false` it is being updated.

S.cleanup() is used in computations that cause side-effects.  It helps us revert the side-effects of the last execution, so that they don't continue to accumulate, and so that we can finally remove them when the computation is disposed.

For instance, say we want to attach a click event handler to an element whenever `foo()` is true:

```javascript
S(() => {
    if (foo()) {
        var onClickHandler = e => doSomething();
        el.addEventListener('click', onClickHandler);
    }
});
```

We then notice that even when `foo()` is false, `doSomething` is still called!  

This is because what our code is actually doing is attaching a *new* event listener each time `foo()` turns true.  If `foo()` goes true-false-true-false-true, we'll have three event handlers subscribed.  

Our side-effects are accumulating, when we want only the last one to be present.

`S.cleanup()` lets us fix that:

```javascript
S(() => {
    if (foo()) {
        var onClickHandler = e => doSomething();
        el.addEventListener('click', onClickHandler);
        S.cleanup(() => el.removeEventListener('click', onClickHandler));
    }
});
```

The function passed into `S.cleanup()`, the one that removes the listener, will be called just before the computation's next update or, if that doesn't happen, just before the computation is disposed.  Since the cleanup removes the old listener, we'll be left with only 0 or 1 listeners, depending on whether `foo()` was true when the computation ran.

Because it's clearest to define cleanup functions adjacent to the code that needs cleaning up, S lets you call `S.cleanup()` as many times as you need in your computation.  All the supplied functions will run just before the computation updates or is disposed.

## Advanced

### Setting Data Signals From Computations

S allows computations to set data signals.  Since state is immutable during an update, these changes don't take effect until the current update finishes, at which point the system performs a follow-on update to account for the new values.

```javascript
S(() => { if (balance() < 0) overdrawn(true); });
```

There can be any number of follow-on updates.  The code below makes sure `foo()` is greater than 10 by incrementing it until it is.

```javascript
S(() => foo() > 10 || foo(foo() + 1));
```

Updates continue until there is a round where no more mutations are generated.  At that point, the system is called "at rest" or having "run to completion."  It awaits an external data signal change to initiate further updates.

Mutating data signals from computations is a very powerful feature but needs a few warnings:

1. Be careful not to create runaway mutation cycles, where you set a data signal you also read, thereby auto-invalidating your computation and causing another run, and another, and another, etc.  This can be avoided by either using `S.on()` or `S.sample()` to suppress a dependency on the mutated signal, or by having a base condition that halts the mutation once the condition is met.  Note that if you do have a runaway mutation, S will throw an exception after an excessively long number of follow-on updates (currently hardcoded to 100,000).

2. Be aware that all the states of the mutated data signal are visible to other computations.  So in the line above that sets `overdrawn()`, there will be a round of updates where `balance()` is less than 0 but `overdrawn()` has not yet been set to `true`, followed by a round in which it has.

3. Not a bug but a feature: S will throw an exception if you try to set a data signal to two different values during the same update.  I.e., it's not "last set wins."  This is on purpose: your program has a bug, in that two different parts disagree about what the next value of the data signal should be.  Note that you *can* set a data signal twice to the *same* value, as determined by `===` or whatever comparator you may have passed to `S.value()`.

With all these caveats, it's worth asking whether it ever makes sense to mutate a data signal from a computation.  In general, there are two scenarios where it may:

Case 1. To provide a more natural and guaranteed way of writing "rule"-like behavior.

```javascript
S(() => {
    if (checking() < 0 && savings() > 1000) {
        checking(checking() + 1000);
        savings(savings() - 1000);
    }
});
```

This example embodies the rule "transfer $1,000 from savings into checking whenever checking is overdrawn and savings has the money."  It doesn't matter what bit of code set checking low, it will always run as long as its condition is met, possibly even making a few transfers if checking was very low.

The alternative would be to have a `withdraw(amount)` function which first checked if checking had the requisite funds and initiated a transfer if not.  That would work *if* all parts of your code were sure to call the function rather than modifying `checking()` directly.  The above rule functions no matter where the change comes from.

Case 2. For algorithmic optimizations.

Say we had 1,000 computations all watching whether `foo()` was their particular value:

```javascript
S(() => { if (foo() === 0) do0(); });
S(() => { if (foo() === 1) do1(); });
S(() => { if (foo() === 2) do2(); });
// ... etc
S(() => { if (foo() === 1000) do1000(); });
```

Every time `foo()` changes, all 1,000 wake up to check it, making for an overall complexity of O(N), where N here is 1,000.

We can change that to O(1) by creating an array of 1,000 boolean data signals, each representing whether `foo()` is their value, plus a 'dispatch' computation that sets just one of the 1,000 data signals:

```javascript
var bins = ... array of 1,000 boolean data signals;
S(() => bins[foo()](true)); 
S(() => { if (bins[0]()) do0(); });
S(() => { if (bins[1]()) do1(); });
S(() => { if (bins[2]()) do2(); });
// ... etc
S(() => { if (bins[1000]()) do1000(); });
```

Now only one of the watchers fires each time, the one whose bin was set, resulting in a complexity of O(1).

However, the cost of this optimization, besides the complexity introduced, is that we've broken synchronicity: the watchers don't run until the update *after* `foo()` changes to their value, because only then does the change to their bin take effect.

## Experimental

### `S.subclock(() => <code>)`
Run computations and data signals created by `<code>` on a subclock, meaning that they don't just run but run *to completion* before surrounding code reads them.

This is still an experimental feature, meaning it's still proving its usefulness in S and may be removed and/or changed in the future.  It currently requires the use of a different compilation of S: `import S from 's-js/withsubclocks';`

`S.subclock()` is only meaningful in scenarios where we are setting data signals from computations.  The problem it solves is to restore synchronicity to such changes by removing other computation's awareness of intermediate states and exposing only the final, at rest state.

Take the "increment `foo()` until it's > 10" example from above, but now we'll attach a logger so we can see its behavior:

```javascript
var foo = S.value(20);
S(() => foo() > 10 || foo(foo() + 1));
S(() => console.log(foo()));
```

If we kick it off by setting `foo()` to a value less than 10, we can see the behavior:

```javascript
foo(5);
> 5
> 6
> 7
> 8
> 9
> 10
> 11
```

However, if we create both `foo()` and the incrementer in a subclock and leave the logger outside it, the logger only sees the final value.

```javascript
var foo;
S.subclock(() => {
    foo = S.value(20);
    S(() => foo() > 10 || foo(foo() + 1));
});
S(() => console.log(foo()));
foo(5);
> 11
```

In effect, subclocks "partition" time, allowing the subclock to go through many ticks in the time the surrounding clock only goes through one.

Subclocks can be used to make optimizations like the ones above synchronous, and can also provide synchronous equivalents to many of the utilities in event-based, data-flow oriented reactive libraries, like filtering events so that only ones meeting certain conditions propagate.

&copy; 2018 Adam Haile, adam.haile@gmail.com.  MIT License.
