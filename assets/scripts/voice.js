/* global prop, game_paused, ui_log, speech_run_queue */
/* global input_select, input_change, input_keydown */
/* global log, LOG_DEBUG, LOG_WARNING */
/* global Fiber */

/* jshint indent: 2 */
/* jshint unused: false */

function voice_init_pre() {
  prop.voice = {};
  prop.voice.recognitionClass = window.webkitSpeechRecognition;
  prop.voice.enabled = false;
  prop.voice.running = false;
  prop.voice.lastExecuted = null;

  // to be init'd later
  prop.voice.callsigns = {};
  
  prop.voice.numbers = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    size: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    niner: 9
  };

  function argIdentity(regex) {
    return {
      regex: regex,
      parse: function(m) { return m[1]; }
    }
  }

  // FIXME: "turn LEFT heading 360"
  // FIXME: "turn heading 270" recognized as "turn heading to 70"
  var argHeading = argIdentity('(((left|right) )?[0-9]+)');
  var argNumber = argIdentity('([0-9]+)');
  var argDir = argIdentity('(left|right)');
  var argAltitude = {
    regex: argNumber.regex,
    parse: function(m) {
      var raw = argNumber.parse(m);
      if (raw.length <= 2) {
        return raw;
      }

      return parseInt(raw) / 1000;
    }
  };
  var argRunway = {
    regex: 'runway ([0-9]+|([a-z]+-?)+)( (left|right))?',
    parse: function(m) {
      var number = voice_parse_number(m[1]); 
      var leftright = m[4];
      if (!leftright) {
        return number;
      }

      return number + leftright[0].toUpperCase();
    }
  };
  var argWaypoint = {
    regex: 'to ([a-zA-Z]+)',
    parse: function(m) { 
      return voice_parse_waypoint(m[1]);
    }
  };

  prop.voice.commandArgs = {
    // command -> arg regex
    // executed as /command REGEX( ex[a-z]+)?/
    // NB: This might be better in Aircraft.js
    heading: argHeading,

    climb: argAltitude,
    altitude: argNumber,
    clear: argNumber,
    descend: argNumber,

    hold: argDir,
    circle: argDir,

    fix: argWaypoint,

    speed: argNumber,

    wait: argRunway,
    taxi: argRunway,

    land: argRunway,
  };

  prop.voice.commandAlias = {
    // some spoken commands do not mach to the typed ones
    navigate: 'fix',
    'take off': 'takeoff',

    // some are easily mistaken
    climbs: 'climb',
    kline: 'climb',

    send: 'descend',

    // chrome really dislikes 'taxi'
    text: 'taxi',
    sexy: 'taxi',
    '8 xe': ' taxi', // what the heck, man?

    band: 'land',
  };

  prop.voice.commandIgnore = {
    turn: true, // eg: turn heading 270 causes dup
    to: true
  };

}

function voice_init() {
  $(window).blur(function() {
    voice_stop();
  });

  $(window).focus(function() {
    if (!game_paused()) {
      voice_start();
    }
  });

  if('atc-voice-enabled' in localStorage && localStorage['atc-voice-enabled'] == 'true') {
    prop.voice.enabled = true;
    $(".voice-toggle").addClass("active");
  }
}

function voice_ready() {
  // index airlines by callsign
  for (var icao in prop.airline.airlines) {
    var airline = prop.airline.airlines[icao];
    var callsign = airline.callsign.name;
    prop.voice.callsigns[callsign.toLowerCase()] = icao;
  }
  prop.voice.init = true;

  voice_start();
}

function voice_toggle() {
  prop.voice.enabled = !prop.voice.enabled;

  if (prop.voice.enabled) {
    $(".voice-toggle").addClass("active");
    voice_start();
  } else {
    $(".voice-toggle").removeClass("active");
    voice_stop();
  }

  localStorage['atc-voice-enabled'] = prop.voice.enabled;
}

/**
 * Begin recognizing voice input *if* enabled,
 *  and *if* not already doing so
 */
function voice_start() {
  if (!(prop.voice.enabled 
      && prop.voice.recognitionClass
      && prop.voice.init)) {
    return;
  } else if (prop.voice.running) {
    // prevent "already started" error
    return;
  } else if (!prop.voice.recognition) {
    prop.voice.recognition = new prop.voice.recognitionClass();
    prop.voice.recognition.continuous = true;
    prop.voice.recognition.interimResults = true;
    prop.voice.recognition.lang = "en";
    prop.voice.recognition.onresult = voice_onresult;
    prop.voice.recognition.onend = voice_onend;
  }

  prop.voice.recognition.start();
  prop.voice.running = true;
}

function voice_stop() {
  $('.voice-toggle').removeClass('voice');
  if (!prop.voice.running) {
    return;
  }

  prop.voice.running = false;
  prop.voice.recognition.stop();
}

function voice_onresult(event) {

  if (prop.speech.synthesis 
      && prop.speech.synthesis.speaking) {
    // "duck" recognition and restart it after 
    //  a delay (so we don't catch the tail)
    voice_stop();
    voice_unduck();
    return;
  }

  // add some UI
  $('.voice-toggle').addClass('voice');

  var bestResultObj, bestResult;
  try {
    bestResultObj = event.results[0];
    bestResult = bestResultObj[0];
  } catch (e) {
    // no result, I suppose
    return;
  }
  prop.voice.recognizing = !bestResultObj.isFinal;

  var result = voice_process(
    bestResultObj.isFinal,
    bestResult.transcript.toLowerCase()
  );
  if (result.isValid() && bestResultObj.isFinal) {
    var command = result.toCommand();
    ui_log('>> ' + command, /* speak= */false);
    voice_execute(command);
  } else if (result.isValid()) {
    $("#command").val(result.toCommand());
  } else if (result.callsign) {
    input_select(result.callsign);
  }

  if (bestResultObj.isFinal) {
    // restart listening
    voice_restart();
    speech_run_queue();
  }
}

function voice_onend() {
  $('.voice-toggle').removeClass('voice');
  if (prop.voice.running) {
    // we just requested a restart;
    //  clear running flag so we can start
    prop.voice.running = false;
    voice_start();
  }
}

function voice_restart() {
  // (the onend listener will handle startup)
  prop.voice.recognition.stop();
}

function voice_unduck() {
  if (prop.speech.synthesis.speaking) {
    // still speaking; try again
    clearTimeout(prop.voice.restart);
    prop.voice.restart = setTimeout(voice_unduck, 1500);
  } else {
    // unduck!
    voice_start()
  }
}

function voice_process(isFinal, raw) {
  var result = false;
  try {
    result = voice_process_unsafe(isFinal, raw);
  } catch (e) {
    log(e, LOG_WARNING);
  }

  if (!result.isValid() && isFinal) log("???" + raw, LOG_DEBUG);
  return result;
}

function voice_execute(fullCommand) {

  if (prop.voice.lastExecuted == fullCommand) {
    // suppress the dup
    return;
  }
  prop.voice.lastExecuted = fullCommand;

  // semi-janky way of reusing existing command parsing
  $("#command").val(fullCommand);
  input_change();
  input_keydown({which: 13}); // enter key
}

function voice_process_unsafe(isFinal, raw) {
  return new VoiceCommand(isFinal, raw);
}

function voice_process_commands(isFinal, raw) {

  for (var alias in prop.voice.commandAlias) {
    raw = raw.replace(alias, prop.voice.commandAlias[alias]);
  }

  var found = [];

  // TODO probably, do this at INIT somehow
  var possibleCommands = prop.aircraft.list[0].COMMANDS;
  for (var i in possibleCommands) {
    var command = possibleCommands[i];
    var index = raw.indexOf(' ' + command);
    if (~index) {
      found[index] = {
        command: command,
        args: voice_process_args(raw, command)
      }
    }
  }

  // sorted and simplified!
  var result = [];
  for (i in found) {
    if (found[i]) {
      result.push(found[i]);
    }
  }
  return result;
}

function voice_process_args(raw, command) {

  if (prop.voice.commandIgnore[command]) {
    return;
  }

  var handler = prop.voice.commandArgs[command];
  if (!handler) {
    return command;
  }

  var regex = new RegExp(command 
    + ' .*?' + handler.regex + '( ex[a-z]+)?');
  var match = raw.match(regex);
  if (!match) {
    log(command + " did not match: " + regex);
    return;
  }

  var parsed = handler.parse(match);
  if (!parsed) {
    log({cmd: command, rgx: regex, mch: match}, LOG_DEBUG);
    return;
  }

  var expedite = match[match.length - 1];
  return parsed + (expedite ? ' expedite' : '');
}

function voice_parse_number(number) {
  if (number.match(/[0-9]+/)) {
    return number;
  }

  // handle things like one-two
  var parts = number.split(/-/);
  var result = ''
  for (var i in parts) {
    var asNum = prop.voice.numbers[parts[i]];
    if (!asNum) {
      return result; // we did what we could
    }

    result += asNum;
  }
  return result;
}

function voice_parse_airline(raw) {
  var airline = raw.toLowerCase();
  var actual = prop.voice.callsigns[airline];
  if (actual) {
    // easy like pie
    return actual;
  }

  // compare with active callsigns (unique-ified)
  var activeAirlines = prop.aircraft.list.map(function(craft) {
    return {
      icao: craft.airline,
      name: prop.airline.airlines[craft.airline].callsign.name
    }
  });

  var sorted = activeAirlines.sort(function(first, second) {
    // second - first so greater similarity is *first*
    first = first.name;
    second = second.name;
    return voice_similarity(airline, second) - voice_similarity(airline, first);
  });

  return sorted[0].icao;
}

function voice_parse_waypoint(raw) {

  var capitalized = raw.toUpperCase();
  var fixesMap = prop.airport.current.fixes;
  if (fixesMap[capitalized]) {
    // quick accept
    return capitalized;
  }

  // okay, no exact match; usually speech recognition
  //  gets the first character right, so let's filter
  //  out those definitely wrong
  var fixes = Object.keys(fixesMap).filter(function(fix) {
    return fix[0] == capitalized[0];
  });

  if (!fixes.length) {
    // no possible matching fix
    ui_log(true, "No fix like: " + raw, false);
    return;
  } else if (fixes.length == 1) {
    // unambiguous
    return fixes[0];
  }

  // okay, ambiguous; let's try word similarity
  var sorted = fixes.sort(function(first, second) {
    // second - first so greater similarity is *first*
    return voice_similarity(capitalized, second) - voice_similarity(capitalized, first);
  });

  return sorted[0];
}


/**
 * This is some bogus similarity metric I just made up,
 *  but it seems to work pretty okay.
 * @return a score in the range [0, 1]
 */
function voice_similarity(heard, guess) {
  heard = heard.toLowerCase().replace(/y/g, 'i');
  guess = guess.toLowerCase().replace(/y/g, 'i');

  var vowelsRegex = /[aeiou]/g;
  var hVowels = heard.match(vowelsRegex);
  var gVowels = guess.match(vowelsRegex);

  var matchingVowels = 0;
  for (var i=0; i < hVowels.length; i++) {
    if (hVowels[i] === gVowels[i])
      matchingVowels++;
  }

  var consRegex = /[^aeiou]/g;
  var hCons = heard.match(consRegex);
  var gCons = guess.match(consRegex);

  var matchingCons = 0;
  for (i=0; i < hCons.length; i++) {
    if (hCons[i] === gCons[i]
        // TODO generify this:
          || (hCons[i] === 's' && gCons[i] === 'c')) {
      matchingCons++;
    }
  }

  var vowelScore = matchingVowels / hVowels.length;
  var consScore = matchingCons / hCons.length;

  // NB: if the word we heard is slightly shorter, score higher
  var lenScore = heard.length / guess.length;

  // should we weight vowels higher?
  return (vowelScore + consScore + lenScore) / 3;
}

var VoiceCommand = Fiber.extend(function() {
  return {
    init: function(isFinal, raw) {
      this.isFinal = isFinal;
      this.raw = raw;

      this.parts = this._splitParts(raw);
      this.callsign = this._parseCallsign(this.parts[0]);
      this.commands = voice_process_commands(isFinal, raw);

      if (!this.callsign && isFinal) {
        // don't notify for interim results
        ui_log(/* warn= */true, "Unknown callsign " + this.parts[0]);
      }
    },

    isValid: function() {
      return this.callsign && this.commands.length;
    },

    toCommand: function() {
      var full = this.callsign;
      for (var i in this.commands) {
        full += ' ' + this.commands[i].command;
        full += ' ' + this.commands[i].args;
      }
      return full;
    },

    _getPossibleCommands: function() {
      return prop.aircraft.list[0].COMMANDS;
    },

    _splitParts: function(raw) {
      
      // TODO can we be more heuristic about command aliases?
      //  Perhaps use regex to match core sounds? 
      //  (eg: taxi -> /t.{0,2}x.{0.2}/)
      for (var alias in prop.voice.commandAlias) {
        raw = raw.replace(alias, prop.voice.commandAlias[alias]);
      }

      // find where commands begin
      var indices = [];
      var possibleCommands = this._getPossibleCommands();
      for (var i in possibleCommands) {
        var command = possibleCommands[i];
        var index = raw.indexOf(' ' + command);
        if (~index) {
          indices.push(index);
        }
      }

      // sort the indices
      indices.sort();
      indices.push(raw.length);

      // split the raw command into more easily parsed parts
      //  In particular, we know the first part SHOULD be
      //  a valid callsign. If parts.length == 1 and we aren't
      //  confident about a callsign, either this is early on
      //  or the user is not talking to us
      var parts = [];
      var last = 0;
      for (i in indices) {
        var idx = indices[i];

        parts.push(raw.substring(last, idx).trim());
        last = idx;
      }

      return parts;
    },

    _parseCallsign: function(raw) {
      // sometimes numbers become words;
      //  let's deconstruct and reconstruct
      var parts = raw.split(/ +/);
      raw = '';
      for (var i in parts) {
        var number = voice_parse_number(parts[i]);
        if (number && number.length) {
          raw += number;
        } else {
          raw += ' ' + parts[i] + ' ';
        }
      }
      raw = raw.trim();

      var airplaneMatch = raw.match(/(.*?)[ ]([0-9]+)/);
      if (!airplaneMatch) {
        // possibly an interim match, possibly
        //  actual just nothing
        return;
      }

      var airline = airplaneMatch[1];
      var callsign = airplaneMatch[2];
      var icao = voice_parse_airline(airline);
      if (icao == 'cessna') {
        icao = 'N';

        // cessna callsigns include two letters after
        // TODO just try all variations if there're more
        //  than two words after the numbers
        parts = raw.replace(/x ray/i, "x-ray")
                   .replace(/fox trot/i, "foxtrot")
                   .split(/ +/);
        var letter1 = parts[2];
        var letter2 = parts[3];
        if (!(letter1 && letter2)) {
          // probably an interim result; don't sweat it
          return;
        }

        // ex: cessna 510 uniform alpha
        callsign += letter1[0] + letter2[0];
      }

      var full = (icao + callsign).toUpperCase();
      if (this._findPlane(full)) {
        return full;
      } else if (icao) {
        // find planes with this airline
        return this._parseCallsignByAirline(icao, raw);
      } else {
        return this._parseCallsignByNumber(callsign, raw);
      }
    },

    _parseCallsignByAirline: function(airline, raw) {
      var candidates = prop.aircraft.list.filter(function(craft) {
        return craft.airline == airline;
      });

      if (candidates.length == 1) {
        // easy peasy
        return candidates[0].getCallsign();
      }

      // FIXME
      return null;
    },

    _parseCallsignByNumber: function(number, raw) {
      // FIXME
      console.warn("CALLSIGN BY NUMBER!");
    },

    _findPlane: function(callsign) {
      for (var i in prop.aircraft.list) {
        var craft = prop.aircraft.list[i];
        if (craft.getCallsign() == callsign) {
          return true;
        }
      }
      return false;
    }
  }
});

if (module) {
  module.exports = {
    init_pre: voice_init_pre
  , ready: voice_ready
  , process: voice_process_unsafe
  , similarity: voice_similarity
  }
}
