# S.js

S.js is a small library for performing **simple, clean, fast reactive programming** in Javascript: a simple mental model, a clean and expressive syntax, and fast execution.  It takes its name from two reactive terms: **signal**, a value that changes over time, and **synchronous**, a strategy for simplifying change.

```javascript
var a = S.data(1),                   //       
    b = S.data(2),                   //       ^
    c = S(() => a() + b()),          //   d() |  3    15    21    55  
    d = S(() => c() * a()); // t0    //   c() |  3     5     7    11 
                                     //   b() |  2     2     4     6
a(3); // t1                          //   a() |  1     3     3     5
b(4); // t2                          //       +------------------------>
S.freeze(() => {                     //         t0    t1    t2    t3 
    a(5);                            //
    b(6);                            //
}); // t3                            //
```

An S app consists of data and computations on data.  As the data changes, S updates the affected computations.

To achieve this, the data and computations are wrapped as *signals* using `S.data(<value>)` for data and `S(() => <code>)` for computations.

S implements signals as closures: call a signal to read its current value; pass a data signal a new value to change it.

If a change affects multiple computations, S uses what's called a *synchronous* execution model: it is as though all computations update "instantly."  They can't, of course, but S maintains this behavior by three invariants: computations always return current (not stale) values, they run exactly once per change event (no missed or redundant updates), and if they change any data signals, those changes don't take effect until all other updates have finished.

S allows computations to generate more computations, with the rule that these "child" computations only live until their "parent" updates.  This allows an application to grow *and shrink* with the size of your data.  In general, S applications never need to manually subscribe or unsubscribe from changes.

S has a small API for doing things like aggreggating multiple changes into one event (S.freeze()), deferring updates (S.defer()), controlling dependencies (S.sample()), and so on.  See the full list below.

## How does S work?
As your program runs, S's data signals and computations communicate with each other to build up a live, performant dependency graph of your code.  Computations set an internal 'calling card' variable which referenced signals use to register a dependency.  Since computations may reference the results of other computations, this graph may have _n_ layers, not just two.  

When data signal(s) change, S starts from the changed signals and traverses the dependency graph twice: one pass to mark all downstream computations as stale, remove the old dependency edges and dispose of child computations; and a second pass to update those computations and (re)create their new dependency edges.  S usually gets the order of updates correct, but if execution changes, like a different conditional branch, S may need to suspend a calling computation in order to update a called one before returning the updated value.

In S, data signals are immutable during updates.  If the updates set any values, those values are held in a pending state until the update finishes.  At that point their new values are committed and the system updates accordingly.  This process repeats until the system reaches a quiet state with no more changes.  It then awaits the next external change.

## S API

### Constructors

### `S.data(<value>)`
Construct a data signal whose initial value is `<value>`.

### `S(() => <code>)`
Construct a computation whose value is the result of the given `<code>`.  `<code>` is run at time of construction, then again whenever referenced signals change.

### `S(val => <code>, <seed>)`
Construct a reducing computation, whose new value is derived from the last one, staring with `<seed>`.

### `S.on(<signal>, val => <code>, <seed>, <onchanges>)`
Statically declare a computation's dependencies, rather than relying on S's automatical detection of dependencies. 

`<seed>` is optional, with default `undefined`.

`<onchanges>` is optional and defaults to `false`.  If `<onchanges>` is true, then the initial run is skipped (i.e. computation starts with value <seed> and doesn't run <code> until a change occurs).

`<signal>` may be an array, in which case dependencies are created for each signal in the array.

### Computation options

### `S.orphan().S(...)`
A computation created with the .orphan() modifier is disconnected from its parent, meaning that it is not disposed when the parent updates.  Such a computation will remain alive until it is manually disposed with S.dispose().
 
### `S.defer(<scheduler>).S(...)`
The .defer() modifier controls when a computation updates.  `<scheduler>` is passed the computation's real update function and may return a replacement which will be called in its stead.  This replacement can then determine when to run the real update.

### `S.sum(<value>)`
Construct an accumulating data signal with the given `<value>`.  Sums are updated by passing in a function that takes the old value and returns the new.  Unlike S.data(), sums may be updated several times in the same event, in which case each subsequent update receives the result of the previous.

### Behavior

### `S.freeze(() => <code>)`
Freeze the system until `<code>` completes, meaning that any data changes produced are held pending until the end, at which point they run as a unit.  Returns value of `<code>`.

### `S.sample(<signal>)`
Sample the current value of `<signal>` but don't create a dependency on it.

### Destructors

### `S.dispose(<computation>)`
Dispose `<computation>`.  `<computation>` will still have its value, but that value will no longer update, as it is disconnected from the dependency graph.

Note: S allows computations to create other computations, with the rule that these "child" computations are automatically disposed when their parent updates.  As a result, S.dispose() is generally only needed for top level and .orphan()'d computations.

### `S.cleanup(final => <code>)`
Run the given function just before the enclosing computation updates or is disposed.  The function receives a boolean parameter indicating whether this is the "final" cleanup, with `true` meaning the computation is being disposed, `false` it is being updated.

S.cleanup() is used to free external resources which a computation may have claimed, like DOM event subscriptions.  Computations can register as many cleanup handlers as needed, usually adjacent to where the resources are claimed.

## An Example: TodoMVC in S (plus friends)
What else, right?  S is just a core library for dealing with change; it takes more to build an application.  This example uses the suite Surplus.js, aka "S plus" a few companion libraries.  Most notably, it uses the htmlliterals preprocessor for embedded DOM construction and the S.array() utility for a data signal carrying an array.
```javascript
var Todo = t => ({               // our Todo constructor
        title: S.data(t.title),  // properties are data signals
        done: S.data(t.done)
    }),
    todos = S.array([]),         // our array of todos
    newTitle = S.data(""),       // title for new todos
    addTodo = () => {            // push new title onto list
        todos.push(Todo({ title: newTitle(), done: false }));
        newTitle("");            // clear new title
    },
    view =                       // declarative view
        <input type="text" @data(newTitle)/> <a onclick = addTodo>+</a>
        @todos.map(todo =>     // insert todo views
            <div>
                <input type="checkbox" @data(todo.done) />
                <input type="text" @data(todo.title) />
                <a onclick = (() => todos.remove(todo))>&times;</a>
            </div>);

document.body.appendChild(view); // add view to document
```
Some things to note:

- There's no code to handle updating the application.  Other than a liberal sprinkling of `()'s`, this could be static code.  In the lingo, S enables declarative programming, where we focus on defining how things should be and S handles updating the app from one state to the next as our data changes.

- The htmlliterals library leverages S computations to construct the dynamic parts of the view (note the '@' expressions).  Whenever our data changes, S updates the affected parts of the DOM automatically.  

- S handles updates in as efficient a manner as possible: Surplus.js apps generally place at or near the top of the various web framework benchmarks (ToDoMVC, dbmonster, etc).

Reactive programs also have the benefit of an open structure that enables extensibility.  For instance, we can add localStorage persistence with no changes to the code above and only a handful of new lines:

```javascript
if (localStorage.todos) // load stored todos on start
    todos(JSON.parse(localStorage.todos).map(Todo));
S(() =>                 // store todos whenever they change
    localStorage.todos = JSON.stringify(todos()));
```

&copy; 2016 Adam Haile, adam.haile@gmail.com.  MIT License.
