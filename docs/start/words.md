# Words you'll see

New to building software? These are the words the Flisk docs use, in plain English. You do not need to learn them all: come
back when one gets in your way.

[← Back to the README](../../README.md) · [Never written code? Start here](first-time.md)

### Terminal

A window where you type instructions to your computer instead of clicking. On a Mac it is the app called **Terminal**. On
Windows, Flisk uses the **Ubuntu** app (see [WSL2](#wsl2)). It looks old-fashioned, but it is just a text box that does what
you tell it.

### Command

One line you type (or paste) into the terminal and run with the Enter key, like `flisk up`. Every grey box with a copy button
in these docs is a command you can paste as it is.

### App parts

Most apps are a few programs working together: the website people see, a back end that does the work, and a database that
remembers things. Developers call each one a **service**. Flisk starts all the parts together and connects them for you.

### Node.js

A free program that lets your computer run apps written in JavaScript. Flisk itself is installed with it. Get it from
[nodejs.org](https://nodejs.org/) (the "LTS" button).

### npm

The app store for JavaScript tools. It comes with Node.js. `npm install -g @flisk-sh/flisk` means "download Flisk and make the
`flisk` command available everywhere".

### Install

Download a tool and set it up so you can use it. In these docs, installing is usually one command you paste into the
terminal.

### Docker

An app that runs each part of your app in its own sealed box (a [container](#container)), so it works the same on every
computer. Flisk needs Docker only for bigger apps, for example ones with a database. Get **Docker Desktop** from
[docker.com](https://www.docker.com/products/docker-desktop/) (free for personal use and small companies) and start it before
you run Flisk.

### Container

A sealed box that holds one part of your app with everything it needs, so it runs the same on your laptop and on a
teammate's. Think of it as a game save that includes the game.

### Database

Where your app keeps its information, like orders, users or messages, so nothing is lost when you close it. Like a save file
in a game. Flisk can start one for you (Postgres) on your computer.

### localhost

Your own computer, seen from your web browser. When Flisk prints `http://localhost:3000`, open that link and you see your
app, running on your machine, not on the internet. Nobody else can see it.

### Port

The number after the colon in `localhost:3000`. Each part of your app listens on its own number, like rooms in a building.

### AI helper

An AI coding assistant that can type commands and write code for you: Claude Code, Codex or Cursor. You tell it what to build
in plain words, and it uses Flisk to run the result. See [Pick your agent](../../README.md#pick-your-agent).

### Prompt

What you type to your AI helper, in plain words: "Build me a small online shop and run it on my laptop with Flisk."

### MCP

A standard way for an AI helper to use tools directly. `flisk mcp` lets your helper start, check and restart your app with
Flisk's own tools instead of typing commands. Optional.

### Tilt

A free tool that Flisk uses behind the scenes to watch your files and update the running app the moment you save a change.
Needed only with [Docker](#docker). Flisk writes all its settings for you.

### WSL2

Windows' built-in way to run Linux. Flisk runs on Windows inside the **Ubuntu** app that WSL2 installs. See the
[Windows setup](../setup/windows.md).

### `flisk up`

The command that starts your whole app: every part, in the right order, and prints the links to open.

### `flisk doctor`

The command that checks your computer and tells you, in plain words, what is missing and how to fix it. Run it whenever
something does not work, or ask your AI helper to run it.

### Open source

The code is public and free to use. The Flisk command-line tool is open source under the MIT license.
