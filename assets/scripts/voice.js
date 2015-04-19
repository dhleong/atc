/* global prop, ui_log:true */
/* global input_change: true, input_keydown: true */

/* jshint indent: 2 */
/* jshint unused: false */

function voice_init() {
  prop.voice = {};
  prop.voice.recognitionClass = window.webkitSpeechRecognition;
  prop.voice.enabled = true; // FIXME
  prop.voice.running = false;

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
    nine: 9
  };

  function argIdentity(regex) {
    return {
      regex: regex,
      parse: function(m) { return m[1]; }
    }
  }

  var argHeading = argIdentity('((left|right)? [0-9]+)');
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
      console.log(m);
      var number = voice_parse_number(m[1]); 
      var leftright = m[4];
      if (!leftright) {
        return number;
      }

      return number + leftright[1].toUpperCase();
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

    speed: argNumber,
    taxi: argRunway,

    fix: argWaypoint,
  }

  prop.voice.commandAlias = {
    // some spoken commands do not mach to the typed ones
    navigate: 'fix',
    'take off': 'takeoff'
  }

  prop.voice.commandIgnore = {
    to: true
  }

  if('atc-voice-enabled' in localStorage && localStorage['atc-voice-enabled'] == 'true') {
    prop.voice.enabled = true;
    // $(".voice-toggle").addClass("active"); // FIXME
  }
}

function voice_ready() {
  // index airlines by callsign
  for (var icao in prop.airline.airlines) {
    var airline = prop.airline.airlines[icao];
    var callsign = airline.callsign.name;
    prop.voice.callsigns[callsign.toLowerCase()] = icao;
  }

  if (prop.voice.enabled) {
    voice_start();
  }
}

function voice_start() {
  if (!prop.voice.recognitionClass) {
    return;
  } else if (!prop.voice.recognition) {
    prop.voice.recognition = new prop.voice.recognitionClass();
    prop.voice.recognition.continuous = true;
    // prop.voice.recognition.interimResults = true;
    prop.voice.recognition.lang = "en";
    prop.voice.recognition.onresult = voice_onresult;
    prop.voice.recognition.onend = voice_onend;
  }

  prop.voice.recognition.start();
  prop.voice.running = true;
}

function voice_stop() {
  if (!prop.voice.running) {
    return;
  }

  prop.voice.running = false;
  prop.voice.recognition.stop();
}

function voice_onresult(event) {
  var bestResult;
  try {
    bestResult = event.results[0][0];
  } catch (e) {
  } finally {
    // restart listening
    // (the onend listener will handle startup)
    prop.voice.recognition.stop();
  }

  voice_process(bestResult.transcript);
}

function voice_onend() {
  if (prop.voice.running) {
    // we requested a restart
    voice_start();
  }
}

function voice_process(raw) {
  try {
    voice_process_unsafe(raw);
  } catch (e) {
    console.warn(e);
  }
}

function voice_process_unsafe(raw) {
  var callsign = voice_process_callsign(raw);
  if (!callsign) return;

  var commandString = voice_process_command(raw);

  console.log(">>>", raw);
  console.log("> plane:", callsign);
  console.log("> cmand:", commandString);

  // semi-janky way of reusing existing command parsing
  var fullCommand = callsign.toUpperCase() + commandString;
  $("#command").val(fullCommand);
  input_change();
  input_keydown({which: 13}); // enter key
  
  console.log(">>>> ", fullCommand);
}

function voice_process_callsign(raw) {
  var airplaneMatch = raw.match(/(.*?)[ ]([0-9]+)/);
  if (!airplaneMatch) {
    console.warn("No match:", raw);
    return;
  }

  var airline = airplaneMatch[1].toLowerCase();
  var icao = prop.voice.callsigns[airline];
  var extra = '';
  if (!icao) {
    ui_log(true, "Unknown callsign " + airline);
    return;
  } else if (icao == 'cessna') {
    icao = 'N';

    // cessna callsigns include two letters after
    var parts = raw.split(/ /);
    var letter1 = parts[2];
    var letter2 = parts[3];
    extra = letter1[0] + letter2[0];
  }

  return icao + airplaneMatch[2] + extra;
}

function voice_process_command(raw) {

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
      found[index] = voice_process_args(raw, command)
    }
  }

  // sorted!
  var result = '';
  for (i in found) {
    if (found[i]) {
      result += ' ' + found[i];
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
    console.warn(command, "did not match: " + regex);
    return;
  }

  var parsed = handler.parse(match);
  if (!parsed) {
    console.log(command, regex, match);
    return;
  }

  return command + ' ' + parsed;
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
    ui_log(true, "No fix like", raw);
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
    if (hCons[i] === gCons[i])
      matchingCons++;
  }

  var vowelScore = matchingVowels / hVowels.length;
  var consScore = matchingCons / hCons.length;

  return (vowelScore + consScore) / 2; // should we weight vowels higher?
}
