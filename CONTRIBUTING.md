# Contributing to MicrobeTrace

Thank you for contributing to CDC's Open Source projects! If you have any
questions or doubts, don't be afraid to send them our way. We appreciate all
contributions, and we are looking forward to fostering an open, transparent, and
collaborative environment.

## Theory

In theory, this app should ingest either a list of edges or a FASTA file containing many genome sequences. From there, it should construct a network diagram (either the network implied by the edges, or a Minimum-Spanning Tree based on the shortest TN93 distances between genomes).

## Development

If you're reading this, it's probably because you are somehow involved in the development of this product (If not, I salute your curiosity). This project is based on [Electron-Boilerplate](https://github.com/szwacz/electron-boilerplate).

### Getting Started

To jump right to development, download this repo on a machine running the
operating system for which you want to build an executable. Currently, this is
only x64 Windows. Make sure you also have `node` and `npm` [available on your path](http://stackoverflow.com/questions/37029089/how-to-install-nodejs-lts-on-windows-as-a-local-user-without-admin-rights).
Then, open your command prompt, cd to the project directory, and run the
following command:

    npm install

This will download all of the development dependencies for this project.
WARNING: This will download several hundred megabytes.

(Luckily, the dev dependencies are much, much larger than the prod
dependencies, so the distribution file that should be output will only take
up a few tens of megabytes).

Next, issue the following command to your command prompt:

    npm start

This will launch the developer's view of application itself. It includes
real-time recompilation of main scripts, but not real-time refreshing, so every
time you change something you'll probably need to give the application focus
and then hit `Ctrl-R` to test the change.

### What to touch, what not to

Basically, anything that's listed in the `.gitignore` file shouldn't be messed
with. These are either dependencies that you should download and ignore (e.g.
`node_modules/`), or compiled versions (e.g. `app/stylesheets/main.css`) of
files that are designed to be edited (e.g. `src/stylesheets/main.less`)

At this point, there are only a handful of files that should need editing.
These are:

* src/app.js
* src/background.js
* src/stylesheets/main.less
* app/app.html
* app/views/*
* app/workers/*

### What's screwed up and (probably) fixable

Full disclosure: This project does not adhere to anything close to a set of
best-practices. If you're interested in paying down some technical debt, here
are some good places to start.

1. The File Architecture - Eric designed a quirky system in which each script
was embedded in HTML files (except for the main renderer process, app.js). I
(Tony) haven't taken the time to refactor this, but it really should be done.
2. The Data Architecture - This is a biggie. Right now, this project is mostly
powered by jQuery spaghetti. It works if you (the developer) catch all the edge
cases, but there are a lot of things that can go wrong. What we should do is
implement some sort of MV* framework. I never cared for
[Angular](https://angularjs.org/) and never tried
[React](https://facebook.github.io/react/). I may start moving toward using
[Backbone](http://backbonejs.org/) or [Vuejs](https://vuejs.org/),
time-permitting.
3. The UI - One of the requirements was to show multiple views of the data on
the same monitor at the same time, such that a user can interact with one view
and see the effects on a different view. Rather than use a [clever
solution](http://costas-basdekis.github.io/Panes.js/), Eric just spun the
different views off into separate windows. There are a bunch of things wrong
with this, but foremost is that we then need to use IPC, which sucks. It also
makes this issue intimately tied in with items 1 and 2, above. If you're
ambitious, tackle all three at once, and you'll have a much, much better
codebase (and ultimately, product).

### What's screwed up and (probably) not fixable

1. The Dependencies - In spite of the incredibly deep stack of dependencies
that comes with electron-boilerplate, the app itself only requires a dozen or
so javascript libraries. As in most Node-based projects, these are stored in
the `node_modules/` directory. However, jQuery, bootstrap, and plotly are
special snowflakes that require special handling. Plotly is stored in the repo
(I know...) and invoked with script tags. jQuery is `require`d in places where
it should be `import`ed. This is because bootstrap can't handle being loaded in
a node environment like a grown-up.

### Other stuff

There is one especially odd dependency I should mention: TN93.js. This is a
javascript port I (Tony Boyles) wrote of
[libtn93](https://github.com/sdwfrost/libtn93), itself a C port of [TN93
implementation](https://github.com/veg/tn93) used in the original
[HIVTrace](https://github.com/veg/hivtrace). An earlier version of this project
used hivtrace along with [NetworkX](https://networkx.github.io/) to compute a
bounded minimum spanning tree of tn93 distances. Unfortunately, this
architecture proved much too slow and heavy to ship with a viable product. The
javascript alternative has its downsides (most conspicuously, Electron's hacks
around Node's single-threadedness make either writing asynchronous code a
headache, or dooms the user to waiting around a bunch, but usually both).
However, the Javascript solution is comparatively quick (given that it's
performing an O(n^2) operation and there's literally nothing we can do about
that).

Anyway, I've maintained TN93.js in [a separate repository](http://git.biotech.cdc.gov/nsp3/tn93.js).

## Procedural stuff

### Requesting Changes
Our pull request/merging process is designed to give the CDC Surveillance Team
and other in our space an opportunity to consider and discuss any suggested
changes. This policy affects all CDC spaces, both on-line and off, and all users
are expected to abide by it.

### Open an issue in the repository
If you don't have specific language to submit but would like to suggest a change
or have something addressed, you can [open an issue in this repository](http://github.com/cdcgov/MicrobeTrace/issues).
Team members will respond to the issue as soon as possible.

### Submit a pull request
If you would like to contribute, please submit a pull request. In order for us
to merge a pull request, it must:
* Be at least seven days old. Pull requests may be held longer if necessary
  to give people the opportunity to assess it.
* Receive a +1 from a majority of team members associated with the request.
  If there is significant dissent between the team, a meeting will be held to
  discuss a plan of action for the pull request.

## Legal Stuff
Before contributing, we encourage you to also read or [LICENSE](https://github.com/CDCgov/template/blob/master/LICENSE),
[README](https://github.com/CDCgov/template/blob/master/README.md), and
[code-of-conduct](https://github.com/CDCgov/template/blob/master/code-of-conduct.md)
files, also found in this repository. If you have any inquiries or questions not
answered by the content of this repository, feel free to [contact us](mailto:chiic@cdc.gov).

### Public Domain
This project is in the public domain within the United States, and copyright and
related rights in the work worldwide are waived through the [CC0 1.0 Universal public domain dedication](https://creativecommons.org/publicdomain/zero/1.0/).
All contributions to this project will be released under the CC0 dedication. By
submitting a pull request you are agreeing to comply with this waiver of
copyright interest.
