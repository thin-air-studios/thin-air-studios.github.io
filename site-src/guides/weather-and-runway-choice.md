---
slug: weather-and-runway-choice
title: How weather changes the runway in use
description: Why airports pick one runway over another, how wind makes headwind and crosswind, and how fog, storms and wind shifts change a landing.
summary: The runway an airport uses depends mostly on the wind. Here is how wind, gusts, fog and storms change which way planes land, and how to read the weather report that controllers use.
eyebrow: Weather
published: 2026-10-27
updated: 2026-10-27
order: 7
demo: KORD
related: how-live-flight-tracking-works, what-is-short-final, iata-vs-icao-airport-codes
---

On a windy day, a plane landing at a big airport may touch down on a runway it did not use an hour before. The runway is not chosen at random. Wind is the main reason, and the rest of the weather decides how the wind and the runway work together. This guide explains that chain, from the wind on the ground to the landing on the runway.

## Why planes land into the wind

An aircraft needs airspeed to fly, and it takes a long run on the ground before it reaches the speed it needs to lift off. A headwind helps on both ends of the flight. The wind adds to the air moving over the wings, so the aircraft can take off in a shorter distance, and the same wind slows its ground speed on landing, so it can stop in less runway. A tailwind works against both.

That is why pilots and controllers want to use a runway that points into the wind, as far as they can. The best runway is the one with the most headwind, and the least crosswind, for the aircraft that is landing.

## Headwind and crosswind

Wind rarely comes straight down the runway. Pilots split it into two parts. The headwind is the part that blows along the runway into the aircraft. The crosswind is the part that blows across it.

You can work out both parts. If the wind is at an angle to the runway, the headwind is the wind speed multiplied by the cosine of the angle, and the crosswind is the wind speed multiplied by the sine. Take a wind of 20 knots at 30 degrees from the runway direction. The headwind is about 17 knots, and the crosswind is 10 knots. At 90 degrees the whole wind is crosswind, and at 0 degrees the whole wind is headwind.

Crosswind is the difficult part. The aircraft must be held straight with the rudder and the wings, and the pilot must keep the centreline during the flare and rollout. Every aircraft has a maximum demonstrated crosswind, given in its flight manual, and crews plan around it. Light aircraft are the most affected, because they are the lightest and the slowest.

## How the runway is chosen

The tower controller chooses the runway in use, working with the airport's operations staff. The choice is based mostly on wind, but the controller also considers noise rules that favour one direction, the traffic flow, the approach aids available, the length of each runway and any closures.

[Chicago O'Hare](/airports/kord/) is one airport with several runways. Many airports have two or more runways that run the same way, so one landing direction can be served by several runways. Others have a main runway and a secondary one, which is used only when the wind or traffic requires it. Either way, the tower announces the runway in use, and the crews listen for it on the automatic weather broadcast, called the ATIS, and in the tower's own calls.

A runway change is a normal event. When the wind shifts, the controller may announce that the runway is changing, and every aircraft on approach is told to expect the new one. The crews then adjust their approaches, which can add time or require a go-around if the change comes late.

## Reading the wind report

Airports publish a routine weather report called a METAR, usually once an hour. It is a short, coded line, and the wind is one of its first groups. A group such as 27015G25KT means the wind is from 270 degrees at 15 knots, gusting to 25 knots. A group that begins VRB means the direction is variable, which is common in light winds. The direction is in degrees true, and the speed is in knots in the United States.

Gusts matter because they change the headwind and crosswind from moment to moment. A steady 15 knots and a gusty 15 knots gusting to 25 are very different on final approach. The pilot plans for the gust factor, which is the difference between the average speed and the gust.

NOAA's Aviation Weather Center publishes these reports publicly at aviationweather.gov. The same service supplies the METARs that the game uses for real weather. [aviationweather.gov](https://aviationweather.gov/)

## Fog and low visibility

Visibility is the other half of a landing. A runway that is perfect in the wind can be unusable in fog. The METAR reports visibility in statute miles in the United States and in metres in most of the world. Its cloud groups give the layers, and the lowest broken or overcast layer is the ceiling.

Airports handle low visibility with approach equipment and crew training. Some aircraft and some runways are approved for landing with very low visibility, and the rules set how low the visibility can be for each combination. The runway visual range, measured by instruments along the runway, tells the crew how far they can see down the centreline. When visibility drops below what the equipment and the crew are approved for, the airport may stop landings until it improves. Those stops can last a long time, and the traffic piles up in holding patterns.

## Storms and wind shear

Thunderstorms are the most dangerous weather for aircraft. Lightning, heavy rain, hail and sudden gusts can all happen in a few minutes. A storm close to the airport can stop ground operations, because ground staff must shelter from lightning, and it can also force aircraft to go around or divert.

Wind shear is a sudden change in wind speed or direction over a short distance or time. Around storms it can come as a downdraft, a burst of air moving down and out from the cloud. Pilots are trained to recognise it and to go around if the aircraft is losing airspeed in the approach. Controllers warn crews of reported wind shear, and they may switch runways to avoid the worst of it.

## How the game uses real weather

[Short Final](/) uses the real weather at the airport you pick. The game fetches the airport's current METAR from aviationweather.gov. The wind from that report sets the wind in the game and helps decide which runway end is active.

The rule is simple and it is written into the game. The game compares the headwind on each end of each runway, and it chooses the end with more headwind. When the wind is under three knots, the game keeps the runway it already has. Real fog or thunderstorms in the report seed the game's own weather, so a stormy airport plays differently from a calm one.

The game is simpler than a real airport. It picks the runway by headwind alone. A real controller also weighs noise, traffic, approach aids, length and closures, which is why the runway in use is not always the one into the wind. The game also changes the wind during a game, so a runway can be flipped mid-approach, which is the kind of change a real controller warns the crews about.

## What to remember

- Aircraft take off and land into the wind, because a headwind shortens the run on the ground.
- Headwind is the wind speed times the cosine of the angle, and crosswind is the speed times the sine.
- The runway in use is chosen mainly from the wind, with noise, traffic and length also counted.
- The METAR has the wind, gusts and visibility. Read the wind group first.

{{demo}}

{{play}}

## Sources

- [aviationweather.gov, NOAA's Aviation Weather Center](https://aviationweather.gov/)
- [FAA Pilot's Handbook of Aeronautical Knowledge](https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/phak)
- [FAA Aeronautical Information Manual, chapter 7 (Safety of Flight)](https://www.faa.gov/air_traffic/publications/atpubs/aim_html/)
- [SKYbrary: the aviation safety knowledge base](https://skybrary.aero/)
