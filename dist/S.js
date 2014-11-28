(function(__exports__) {
  "use strict";
  var S = (function () {
      var count = 1,
          listener = undefined,
          region = [],
          deferred = [];

      // initializer
      S.lift     = lift;

      S.data    = data;
      S.formula = formula;
      S.region  = _region;
      S.peek    = peek;
      S.defer   = defer;

      S.data.S = dataCombinator;
      formulaCombinator.prototype = new dataCombinator();
      S.formula.S = formulaCombinator;

      return S;

      function S(arg1, arg2) {
          return S.lift(arg1, arg2);
      }

      function lift(arg1, arg2) {
          return typeof arg1 === 'function' ? formula(arg1, arg2)
              : arg1 instanceof Array ? S.seq(arg1)
              : data(arg1);
      }

      function data(msg) {
          if (msg === undefined) throw new Error("S.data can't be initialized with undefined.  In S, undefined is reserved for namespace lookup failures.");

          var id = count++,
              listeners = [],
              our_region = region;

          data.S = new dataCombinator();
          data.toString = dataToString;

          return data;

          function data(new_msg) {
              if (arguments.length > 0) {
                  if (new_msg === undefined) throw new Error("S.data can't be set to undefined.  In S, undefined is reserved for namespace lookup failures.");
                  msg = new_msg;
                  propagate(listeners);
                  runDeferred();
              } else {
                  if (listener) listener(id, our_region, listeners);
              }
              return msg;
          }
      }

      function formula(fn) {
          var id = count++,
              gen = 1,
              updating = false,
              msg,
              // for sources, use parallel arrays instead of array of objects so that we can scan ids and gens fast
              source_ids = [],
              source_gens = [],
              source_offsets = [],
              source_listeners = [],
              listeners = [],
              our_region = region,
              updaters = initUpdaters(update, id, this);

          formula.S = new formulaCombinator(detach);
          formula.toString = toString;

          updaters[updaters.length - 1]();

          return formula;

          function formula() {
              if (listener) listener(id, our_region, listeners);
              return msg;
          }

          function update() {
              var new_msg,
                  prev_listener,
                  prev_region;

              if (!updating) {
                  updating = true;
                  prev_listener = listener, listener = our_listener;
                  prev_region = region, region = our_region;

                  gen++;

                  try {
                      new_msg = fn();

                      if (new_msg !== undefined) {
                          msg = new_msg;
                          propagate(listeners);
                      }
                  } finally {
                      updating = false;
                      listener = prev_listener;
                      region = prev_region;
                  }

                  pruneStaleSources(gen, source_gens, source_offsets, source_listeners);
              }
          }

          function our_listener(sid, source_region, listeners) {
              var i, j, len, offset;

              for (i = 0, len = source_ids.length; i < len; i++) {
                  if (sid === source_ids[i]) {
                      offset = source_offsets[i];
                      if (listeners[offset] === null) {
                          listeners[offset] = source_listeners[i];
                          source_listeners[i] = listeners;
                      }
                      source_gens[i] = gen;
                      return;
                  }
              }

              offset = listeners.length;

              source_ids.push(sid);
              source_gens.push(gen);
              source_offsets.push(offset);
              source_listeners.push(listeners);

              // set i to the point where the region paths diverge
              for (i = 0, len = Math.min(our_region.length, source_region.length);
                   i < len && our_region[i] === source_region[i];
                   i++);

              listeners.push(updaters[i]);

              for (len = our_region.length; i < len; i++) {
                  our_region[i].offsets.push(offset);
                  our_region[i].listeners.push(listeners);
              }
          }

          function detach() {
              var i, len;

              for (i = 0, len = source_offsets.length; i < len; i++) {
                  source_listeners[i][source_offsets[i]] = undefined;
                  source_listeners[i] = undefined;
              }
          }

          function toString() {
              return "[formula: " + fn + "]";
          }
      }

      function pruneStaleSources(gen, source_gens, source_offsets, source_listeners) {
          var i, len, source_gen, listeners, offset;

          for (i = 0, len = source_gens.length; i < len; i++) {
              source_gen = source_gens[i];
              if (source_gen !== 0 && source_gen < gen) {
                  listeners = source_listeners[i];
                  offset = source_offsets[i];
                  source_listeners[i] = listeners[offset];
                  listeners[offset] = null;
                  source_gens[i] = 0;
              }
          }
      }

      function initUpdaters(update, id, mod) {
          var i, updaters = [];

          if (mod && mod.fn) update = mod.fn(update, id);

          updaters[region.length] = update;

          for (i = region.length - 1; i >= 0; i--) {
              if (region.mod) update = region.mod(update, id);
              updaters[i] = update;
          }

          return updaters;
      }

      function dataCombinator() { }

      function formulaCombinator(detach) {
          this.detach = detach;
      }

      function regionCombinator(detach) {
          this.detach = detach;
      }

      function propagate(listeners) {
          var i, len, listener;

          for (i = 0, len = listeners.length; i < len; i++) {
              listener = listeners[i];
              if (listener) {
                  listener();
              }
          }
      }

      function dataToString() {
          return "[data: " + S.peek(this) + "]";
      }

      function _region(fn) {
          var prev_region = region,
              offsets = [],
              listeners = [];

          region = region.slice();

          region.push({
              mod: this && this.mod ? this.mod : null,
              offsets: offsets,
              listeners: listeners
          });

          try {
              fn();
          } finally {
              region = prev_region;
          }

          return {
              S: new regionCombinator(detach)
          }

          function detach() {
              var i, len;

              for (i = 0, len = listeners.length; i < len; i++) {
                  listeners[i][offsets[i]] = undefined;
              }
          }
      }

      function peek(fn) {
          var prev_listener,
              val;

          if (!listener) {
              val = fn();
          } else {
              prev_listener = listener, listener = undefined;

              try {
                  val = fn();
              } finally {
                  listener = prev_listener;
              }
          }

          return val;
      }

      function defer(fn) {
          deferred.push(fn);
      }

      function runDeferred() {
          if (listener) return;
          while (deferred.length !== 0) {
              deferred.shift()();
          }
      }
  })();

  __exports__.S = S;

  (function (S) {
      S.Chainable = Chainable;

      return;

      function Chainable(fn, prev, head) {
          this.head = head !== undefined ? head : (prev && prev.head !== undefined) ? prev.head : null;
          this.fn = (prev && prev.fn !== undefined) ? compose(prev.fn, fn) : fn;
      }

      function compose(f, g) {
          return function compose(x) { return f(g(x)); };
      }

  })(S);

  (function (S) {

      var _S_defer = S.defer;

      ChainableMod.prototype = new S.Chainable();
      ChainableMod.prototype.S = S.formula;

      S.defer          = ChainableMod.prototype.defer          = chainableDefer;
      S.delay          = ChainableMod.prototype.delay          = chainableDelay;
      S.debounce       = ChainableMod.prototype.debounce       = chainableDebounce;
      S.throttle       = ChainableMod.prototype.throttle       = chainableThrottle;
      S.pause          = ChainableMod.prototype.pause          = chainablePause;
      S.throttledPause = ChainableMod.prototype.throttledPause = chainableThrottledPause;

      return;

      function ChainableMod(fn, prev) {
          S.Chainable.call(this, fn, prev);
      }

      function chainableDefer()     { return new ChainableMod(defer(),     this); }
      function chainableDelay(t)    { return new ChainableMod(delay(t),    this); }
      function chainableDebounce(t) { return new ChainableMod(debounce(t), this); }
      function chainableThrottle(t) { return new ChainableMod(throttle(t), this); }
      function chainablePause(s)    { return new ChainableMod(pause(s),    this); }
      function chainableThrottledPause(s) { return new ChainableMod(throttledPause(s), this); }

      function defer(fn) {
          if (fn !== undefined) return _S_defer(fn);

          return function (update, id) {
              var scheduled = false;

              return function deferred() {
                  if (scheduled) return;

                  scheduled = true;

                  _S_defer(function deferred() {
                      scheduled = false;
                      update();
                  });
              }
          };
      }

      function delay(t) {
          return function (update, id) {
              return function delayed() { setTimeout(update, t); }
          }
      }

      function throttle(t) {
          return function throttle(fn) {
              var last = 0,
                  scheduled = false;

              return function () {
                  if (scheduled) return;

                  var now = Date.now();

                  if ((now - last) >= t) {
                      last = now;
                      fn();
                  } else {
                      scheduled = true;
                      setTimeout(function throttled() {
                          last = Date.now();
                          scheduled = false;
                          fn();
                      }, t - (now - last));
                  }
              };
          };
      }

      function debounce(t) {
          return function (fn) {
              var tout = 0;

              return function () {
                  if (tout) clearTimeout(tout);

                  tout = setTimeout(fn, t);
              };
          };
      }

      function pause(signal) {
          var fns = [];

          S.formula(function resume() {
              if (!signal()) return;

              for (var i = 0; i < fns.length; i++) {
                  fns[i]();
              }

              fns = [];
          });

          return function (fn) {
              return function () {
                  fns.push(fn);
              }
          }
      }


      function throttledPause(signal) {
          var fns = [];

          S.formula(function resume() {
              if (!signal()) return;

              for (var i = 0; i < fns.length; i++) {
                  fns[i]();
              }

              fns = [];
          });

          return function (fn) {
              var scheduled = false;

              return function () {
                  if (scheduled) return;

                  scheduled = true;

                  fns.push(function paused() {
                      scheduled = false;

                      fn();
                  });
              }
          };
      }
  })(S);

  (function (S) {
      S.rproc = rproc;

      function rproc(fn) {
          var region;

          return S.proc(function () {
              var val;

              if (region) region.S.detach();

              region = S.region(function () {
                  val = fn();
              });

              return val;
          });
      }
  })(S);

  (function (S) {
      "use strict";
  
      S.sub = sub;
  
      return;
  
      function sub(/* arg1, arg2, ... argn, fn */) {
          var args = Array.prototype.slice.call(arguments),
              fn = function () { },
              realFn = args.pop(),
              len = args.length,
              values = new Array(len),
              sub = S(function () {
                  for (var i = 0; i < len; i++) {
                      values[i] = args[i]();
                  }
  
                  return S.peek(function () {
                      return fn.apply(undefined, values);
                  });
              });
  
          fn = realFn;
  
          return sub;
      }
  }(S));

  (function (S) {
      S.toJSON = function toJSON(o) {
          return JSON.stringify(o, function (k, v) {
              return (typeof v === 'function' && v.S) ? v() : v;
          });
      };
  })(S);
})(window);