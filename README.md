# Trinity Auto Builder

Automatic builder and runner for TrinityCore on Windows. This is for my personal use, so I don't have a lot of time to respond to support tickets. 

The intended use is for hunting regressions and testing many different trinitycore builds.

The tool is not perfect and probably butchers some commits, but also remember that old trinitycore commits can be completely broken on their own. 

## Compatibility

I've tried this tool on a few commits and it seems to handle most commits between 2016 and 2022 reasonably well. Anything earlier than that will probably break, but is probably not very useful either.

## Prerequisites

- Visual Studio 2019 or 2022
- Node.js v16+

## Setup

- Clone the repository with submodules: `git clone --recurse-submodules`
- Run `npm i` to install node dependencies.
- Enter the trinitycore directory and checkout the commit you want (custom commits are currently not working, they will break the tdb version download).
- Create a file called `token.env` and put your [GitHub personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) inside.

## Usage

- To clean up build/install files: `node clean` (you need to do this any time you change commits)
- To build trinitycore: `node build`
- To run trinitycore: `node run`