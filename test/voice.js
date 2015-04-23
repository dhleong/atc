#!/usr/bin/env mocha 
/* jshint indent: false */

// prepare global namespace {{{//{{{//}}}
global.LOG_DEBUG = 0;
global.log = function() {};
global.ui_log = global.log;

global.Fiber = require('../assets/scripts/fiber.min');
global.$ = {
  each: function(list, fun) {
    if (Array.isArray(list)) {
      return list.forEach(fun);
    } else {
      return Object.keys(list).forEach(function(key) {
        fun(key, list[key]);
      });
    }
  }
}

global.window = {
}

function aircraft(airline, callsign) {
  return {
    airline: airline,
    callsign: callsign,
    getCallsign: function() {
      // minor hacks
      return ((airline == 'cessna' ? 'N' : airline)
          + callsign).toUpperCase();
    },
    COMMANDS: [
      "land", "takeoff",
      "turn", "fix", "climb", "altitude",
      "taxi"
    ]
  }
}
function readAirline(name) {
  return require("../assets/airlines/" + name + ".json");
}
global.prop = {
  aircraft: {
    list: [
      aircraft("ual", "921"),
      aircraft("baw", "321"),
      aircraft("baw", "404"),
      aircraft("baw", "874"),
      aircraft("cessna", "777cw"),
      aircraft("cessna", "123ct"),
      aircraft("cessna", "542xf"),
    ]
  },
  airline: { airlines: { } },
  airport: {
    current: {
      fixes: {
        PIGZI: true,
        HAMML: true,
        HASTI: true,
        HILLS: true,
        LORAH: true,
        NARCO: true,
      }
    }
  }
};

['aal', 'aca', 'awe', 'baw', 'cessna', 'ual'].forEach(function(icao) {
  global.prop.airline.airlines[icao] =
    readAirline(icao);
});
// }}} 

// clean up mocha stack traces {{{
var path = require('path');
var appRoot = path.resolve(__dirname, '..')+'/';
console.oldError = global.oldError || console.error;
console.error = function () {
  if (typeof arguments.stack !== 'undefined') {
    console.oldError.call(console, arguments.stack);
  } else {
    if (typeof arguments[4] !== 'undefined') {
      var traceToShow = arguments[4].split('\n').slice(0, 4).filter(function(line) {
        return !~line.indexOf('mocha');
      });
      arguments[4] = traceToShow.join('\n').replace(new RegExp(appRoot, 'g'), ''); // jshint ignore:line
    }
    console.oldError.apply(console, arguments);
  }
}
global.oldError = console.oldError;
// }}}

/*
 * normal
 */

var voice = require('../assets/scripts/voice');
require('chai').should();

beforeEach(function() {
  global.prop.voice = null;
  voice.init_pre();
  voice.ready();
});

describe("similarity", function() { // {{{
  it("of seth vs cessna/speedbird", function() {
    var cessna = voice.similarity("seth", "cessna");
    var speedbird = voice.similarity("seth", "speedbird");
    cessna.should.be.greaterThan(speedbird);
  });

  it("of 42xf vs 542xf/123ct", function() {
    var first = voice.similarity("42xf", "542xf");
    var second = voice.similarity("42xf", "123ct");
    first.should.be.greaterThan(second);
  });
}) // }}}

describe("parts", function() { // {{{
  /*
   * We can do more heuristic approaches to esp
   *  callsign deduction if we can split the raw
   *  input into its relevant parts
   */
  handlesRaw("speedbird 321 taxi runway 17 climb 8000", function(result) {
    result.parts.should.eql([
        "speedbird 321",
        "taxi runway 17",
        "climb 8000"
    ]);
  });

  handlesRaw("steve bird niner 21 text run way one seven, kline and maintain 8000", function(result) {
    result.parts.should.eql([
        "steve bird niner 21",
        "taxi run way one seven,",
        "climb and maintain 8000"
    ]);
  });
}); // }}}

describe("callsign", function() {
  // first, some easy ones
  handlesRaw("speedbird 321", function(result) {
    result.callsign.should.equal("BAW321");
  });
  handlesRaw("cessna 777 charlie whiskey", function(result) {
    result.callsign.should.equal("N777CW");
  });
  handlesRaw("united niner 21", function(result) {
    result.callsign.should.equal("UAL921");
  });

  // now, we test intelligent guesses based
  //  on similarity to actual in-use planes
  handlesRaw("umpire 455", function(result) {
    // umpire is closest to `united`; we shouldn't
    //  even care about the numbers
    result.callsign.should.equal("UAL921");
  });

  handlesRaw("steve bird 404", function(result) {
    // pretty close to speedbird
    result.callsign.should.equal("BAW404");
  });

  handlesRaw("seth 777 charlie whiskey", function(result) {
    // seth "sounds" more like cessna (which it is);
    //  also, it's closer in length to cessna
    //  than the other candidate, "speedbird"
    result.callsign.should.equal("N777CW");
  });

  handlesRaw("seth 000 charlie tango", function(result) {
    // no number match, but the letters do
    result.callsign.should.equal("N123CT");
  });


  handlesRaw("speedbird 400", function(result) {
    // airline is clear (this would also work
    //  for "steve bird") but number isn't exact;
    //  look for closets match
    result.callsign.should.equal("BAW404");
  });

  handlesRaw("69777 charlie whiskey", function(result) {
    // chrome does this sometimes...
    result.callsign.should.equal("N777CW");
  });

  handlesRaw("s10 777 charlie whiskey", function(result) {
    // and this
    result.callsign.should.equal("N777CW");
  });

  handlesRaw("seth 42 x ray fox trot", function(result) {
    // and this
    result.callsign.should.equal("N542XF");
  });
})

describe("land", function() {
  handles("land runway one-two left", function(result) {
    result.callsign.should.equal("BAW321");
    result.commands.should.contain({
        command: "land",
        args: "12L"
    });
  });
});

describe("navigate", function() {
  handles("navigate to piggsy", function(result) {
    result.commands.should.contain({
        command: "fix",
        args: "PIGZI"
    });
  });

  handles("navigate to laura", function(result) {
    result.commands.should.contain({
        command: "fix",
        args: "LORAH"
    });
  });

  handles("navigate to ham", function(result) {
    result.commands.should.contain({
        command: "fix",
        args: "HAMML"
    });
  });

  // TODO test more waypoints
});

describe("multiple commands", function() { // {{{
  handles("taxi runway 17, after departure climb and maintain 8000", function(result) {
    result.commands.should.contain({
        command: "taxi",
        args: "17"
    });
    result.commands.should.contain({
        command: "climb",
        args: "8"
    });
  });
}); // }}}

describe("toCommand()", function() { // {{{
  handles("land runway one-two left", function(result) {
    result.toCommand().should.equal(
      "BAW321 land 12L"
    );
  });

  handles("taxi runway 17, after departure climb and maintain 8000", function(result) {
    result.toCommand().should.equal(
      "BAW321 taxi 17 climb 8"
    );
  });
}); // }}}

// Util {{{
function handlesRaw(raw, fun) {
  var wrapped;
  if (fun) {
    wrapped = function() {
      fun(voice.process(true, raw));
    };
  }
  it("handles `" + raw + "`", wrapped);
}

function handles(command, fun) {
  handlesRaw("speedbird 321 " + command, fun);
}
// }}}

// vim:fdm=marker
