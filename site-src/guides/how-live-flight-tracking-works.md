---
slug: how-live-flight-tracking-works
title: How live flight tracking works
description: How flight trackers show planes: ADS-B, radar, multilateration and OpenSky, the limits of live maps, and how Short Final uses real flight data.
summary: Live flight maps show planes because the planes broadcast their own position. Here is how ADS-B, radar and the OpenSky network work, where the data falls short, and how the game uses it.
eyebrow: Flight data
published: 2026-10-27
updated: 2026-10-27
order: 8
demo: KLAX
related: iata-vs-icao-airport-codes, weather-and-runway-choice, how-air-traffic-control-works
---

Open a flight-tracking app over a busy airport and you see dozens of small aircraft symbols, each with a flight number and a height. The map looks like a live feed from the sky, and in a sense it is. Each plane is reporting where it is, and a network of receivers on the ground picks up those reports and passes them on.

This guide explains how that works, what the map can and cannot tell you, and how Short Final uses real planes in its game. The short answer is that the map is useful and approximate. It is not a tool for navigation, and it is not an official view of the air traffic system.

## Radar was the old way

For most of aviation's history, controllers tracked planes with radar. A ground radar sends out a pulse and measures what comes back, and a secondary radar asks the plane's transponder to reply with its height and identity. Radar is still the main tool of air traffic control, and it gives the controller a precise view of the traffic around the airport.

Radar is expensive to build and sits in fixed places, so its coverage is limited to what the antennas can see. Over oceans and remote mountains, controllers rely on other methods.

## ADS-B: planes that report themselves

The newer method is called ADS-B, which stands for Automatic Dependent Surveillance-Broadcast. The name describes what the aircraft does. It works out its own position, usually from satellite navigation, and it broadcasts that position along with its altitude, speed, identity and other data. It does this automatically, several times a second, and it does not wait to be asked.

In the United States, the FAA requires ADS-B Out in most controlled airspace, under a rule that took effect on 1 January 2020. Aircraft that do not have the equipment may be kept out of that airspace unless the controller allows them in. Two radio frequencies are used. Most airliners use the 1090 megahertz Mode S signal, and many light aircraft below 18,000 feet in the United States use a 978 megahertz signal called UAT. [FAA: ADS-B frequently asked questions](https://www.faa.gov/air_traffic/technology/equipadsb/resources/faq)

Because the broadcast is one-way, anyone with a suitable receiver can listen to it. That is why flight trackers can show planes that the trackers' own owners have never met. The data is public in its basic form, though the networks that collect it set their own rules for use.

## Multilateration: working it out from the outside

Not every aircraft broadcasts ADS-B. Some older aircraft carry only a transponder, which answers radar questioning but does not announce its position. For those, a system called multilateration works out the position from the outside.

Several ground receivers pick up the same transponder reply. Each receiver notes when it heard the signal. Because the signal travels at a known speed, the small differences in arrival time between the receivers give the distance differences, and from those the system can calculate the aircraft's position. The result is less frequent than a self-reported ADS-B position, but it covers aircraft that would otherwise be invisible. [SKYbrary: the aviation safety knowledge base](https://skybrary.aero/)

## OpenSky: a network of receivers

The OpenSky Network is one of the best-known public sources of this data. It is a non-profit association based in Switzerland, set up as a research project by several universities and government bodies. It collects ADS-B, Mode S and FLARM data from a large network of receivers. Those receivers are run by volunteers, companies, universities and public agencies, and the data is used for research and shared under its own terms. [Copernicus: the OpenSky Network data set (ESSD, 2021)](https://essd.copernicus.org/articles/13/357/2021/)

OpenSky also offers a public interface that software can ask for the current state of aircraft in an area. Anonymous requests are limited, so an app has to ask no more often than the limit allows. Short Final uses that interface, and it credits The OpenSky Network in the app and in its store listing.

## What the map can and cannot tell you

A live map is a snapshot of reports, and every report has a delay. A plane's position may be a few seconds old, or older when the receiver network is thin. The map may show a plane's last known position for a short time after it stops reporting, and it can jump when a new report arrives.

Coverage has holes. A plane over the middle of the ocean, a remote area with no receivers or a low aircraft behind hills may not appear at all. Some aircraft do not broadcast, and some broadcast without a flight number. A map that shows no plane in an area is not proof that no plane is there.

The map also does not show what the controller sees. It does not show clearances, instructions or the plan the crew is following. A plane heading toward an airport on a map may be in a holding pattern, on a short final or about to go around, and the map cannot tell you which.

That is why the game's store listing says plainly that Short Final is a game, not a flight-tracking or navigation tool, and that live positions are approximate and simplified for play.

## How Short Final uses real planes

[Short Final](/) uses the same kind of live data, in a simplified way. When you pick an airport, the game asks the feed for planes around it. The game does not show every plane in the sky. It counts a real plane as landing at your airport only when several signs agree.

A plane must show a steady descent toward the airport, from a height that fits an approach there. Its reports must be seen on two separate checks, and its track must pass within a few kilometres of the airport, so a plane flying over without landing does not count. The plane needs a flight number or a registration. And it must not be heading for a nearby airport. Until a plane meets all of those tests, it is a real plane in the area, marked with the same red dot, and the game does not bring it in to land.

That is why some airports go a while without a real landing from the feed, even busy ones such as [Los Angeles](/airports/klax/). Real traffic depends on what is in the air at the moment, and the game waits for a plane that really is approaching your airport.

The game polls the feed about once a minute during a live game. Each phone has its own daily allowance for those requests, and the home screen checks the feed at other times, such as when you open the app. Players on one internet connection share an allowance.

## What the game does not claim

The routes the game shows for a real plane's origin come from a separate file of published airline schedules, the Virtual Radar Server standing data. That data is a snapshot of schedules, not a live record of today's flights. When the game says a plane arrived from a city, it is using that snapshot, not confirmed live information.

The game also has a separate mode, Real planes only, which uses only the real planes from the feed and makes nothing up. Turning it on shows the real traffic and nothing else. Without it, the game fills the sky with simulated planes to match your difficulty level, and those planes have no flight number.

## What to remember

- Modern trackers mostly use ADS-B, in which planes report their own position several times a second.
- Multilateration works out the position of older transponders from several receivers' timing.
- OpenSky is a non-profit network of receivers, and its data is approximate and delayed.
- Short Final is a game, not a flight-tracking or navigation tool, and it counts a real landing only when the data agrees.

{{demo}}

{{play}}

## Sources

- [FAA: ADS-B frequently asked questions](https://www.faa.gov/air_traffic/technology/equipadsb/resources/faq)
- [Cornell Legal Information Institute: 14 CFR 91.225, ADS-B Out](https://www.law.cornell.edu/cfr/text/14/91.225)
- [Copernicus ESSD: the OpenSky Network data set, 2021](https://essd.copernicus.org/articles/13/357/2021/)
- [OpenSky Network](https://opensky-network.org/)
- [SKYbrary: the aviation safety knowledge base](https://skybrary.aero/)
