# Kodelab Ripple-HELOC

This project demonstrates a basic Ripple-HELOC use case.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat run scripts/deploy.js
```


## Design Considerations

- Token agnostic
  - system doesn't care about the implementation of external tokens
  - can operate entirely independently of other systems, provided an authority assigns
    initial collateral to users in the system and provides price data.
x
- Verifiable
  - designed from the bottom up to be amenable to formal verification
  - the core cdp and balance database makes *no* external calls and
    contains *no* precision loss (i.e. no division)

- Modular
  - multi contract core system is made to be very adaptable to changing
    requirements.
  - allows for implementations of e.g. auctions, liquidation, CDP risk
    conditions, to be altered on a live system.
  - allows for the addition of novel collateral types (e.g. whitelisting)


## Collateral, Adapters and Wrappers

Collateral is the foundation of HGBP and HGBP creation is not possible
without it. There are many potential candidates for collateral, whether
native ether, ERC20 tokens, other fungible token standards like ERC777,
non-fungible tokens, or any number of other financial instruments.

Token wrappers are one solution to the need to standardise collateral
behaviour in HGBP. Inconsistent decimals and transfer semantics are
reasons for wrapping. For example, the WETH token is an ERC20 wrapper
around native ether.

In MCD, we abstract all of these different token behaviours away behind
*Adapters*.

Adapters manipulate a single core system function: `slip`, which
modifies user collateral balances.

Adapters should be very small and well defined contracts. Adapters are
very powerful and should be carefully vetted by HOC holders. Some
examples are given in `join.sol`. Note that the adapter is the only
connection between a given collateral type and the concrete on-chain
token that it represents.

There can be a multitude of adapters for each collateral type, for
different requirements. For example, ETH collateral could have an
adapter for native ether and *also* for WETH.


## The HGBP Token

The fundamental state of a HGBP balance is given by the balance in the
core (`vat.hgbp`, sometimes referred to as `HGBP`).

Given this, there are a number of ways to implement the HGBP that is used
outside of the system, with different trade offs.

*Fundamentally, "HGBP" is any token that is directly fungible with the
core.*

In the Goerli deployment, "HGBP" is represented by an ERC20 DSToken.
After interacting with CDPs and auctions, users must `exit` from the
system to gain a balance of this token, which can then be used in Oasis
etc.

It is possible to have multiple fungible HGBP tokens, allowing for the
adoption of new token standards. This needs careful consideration from a
UX perspective, with the notion of a canonical token address becoming
increasingly restrictive. In the future, cross-chain communication and
scalable sidechains will likely lead to a proliferation of multiple HGBP
tokens. Users of the core could `exit` into a Plasma sidechain, an
Ethereum shard, or a different blockchain entirely via e.g. the Cosmos
Hub.


## Price Feeds

Price feeds are a crucial part of the HocDAO system. The code here assumes
that there are working price feeds and that their values are being
pushed to the contracts.

Specifically, the price that is required is the highest acceptable
quantity of CDP HGBP debt per unit of collateral.


## Liquidation and Auctions

An important difference between SCD and MCD is the switch from fixed
price sell offs to auctions as the means of liquidating collateral.

The auctions implemented here are simple and expect liquidations to
occur in *fixed size lots* (say 10,000 ETH).


## Settlement

Another important difference between SCD and MCD is in the handling of
System Debt. System Debt is debt that has been taken from risky CDPs.
In SCD this is covered by diluting the collateral pool via the PETH
mechanism. In MCD this is covered by dilution of an external token,
namely HOC.

As in collateral liquidation, this dilution occurs by an auction
(`flop`), using a fixed-size lot.

In order to reduce the collateral intensity of large CDP liquidations,
HOC dilution is delayed by a configurable period (e.g 1 week).

Similarly, System Surplus is handled by an auction (`flap`), which sells
off HGBP surplus in return for the highest bidder in auction (to be designed) .


## Authentication

The contracts here use a very simple multi-owner authentication system,
where a contract totally trusts multiple other contracts to call its
functions and configure it.

It is expected that modification of this state will be via an interface
that is used by the Governance layer.

# ds-chief


## Summary

This contract provides a way to elect a "chief" contract via approval voting.
This may be combined with another contract, such as `DSAuthority`, to elect a
ruleset for a smart contract system.

Voters lock up voting tokens to give their votes weight. The voting mechanism is
[approval voting](https://en.wikipedia.org/wiki/Approval_voting). Users get IOU
tokens any time they lock voting tokens, which is useful for secondary governance mechanisms.
The IOU tokens may not be exchanged for the locked tokens except by someone who
has actually locked funds in the contract, and only up to the amount they have locked.

## Note on Chiefs

Though anthropocentric language is used throughout this document when referring
to the "chief," you should keep in mind that addresses can represent contracts
as well as people. Thus, `ds-chief` works just as well as a method for selecting
code for execution as it does for realizing political processes. For example,
`ds-chief` could conceivably be used as a multisignature contract with
token-weighted voting governing another set of smart contracts using `ds-auth`
with `ds-roles`. In this scenario, "candidates" would consist of contracts
mutating the state of the smart contract set under governance. Such a contract
being elected "chief" would be granted all permissions to execute whatever
changes necessary. `ds-chief` could also be used within such a contract
set in conjunction with a proxy contract like `ds-proxy` or a name resolution
system like ENS for the purpose of voting in new versions of contracts.


## Why an IOU Token?

The IOU token allows for chaining governance contracts. An arbitrary number of
`DSChief`, `DSPrism`, or other contracts of that kind may essentially use the
same governance token by accepting the IOU token of the `DSChief` contract
before it as a governance token. E.g., given three `DSChief` contracts,
`chiefA`, `chiefB`, and `chiefC`, with `chiefA.GOV` being the `HOC` token,
setting `chiefB.GOV` to `chiefA.IOU` and `chiefC.GOV` to `chiefB.IOU` allows all
three contracts to essentially run using a common pool of `HOC`.


## Approval Voting

**Approval voting** is when each voter selects which candidates they approve of,
with the top `n` "most approved" candidates being elected. Each voter can cast
up to `n + k` votes, where `k` is some non-zero positive integer. This allows
voters to move their approval from one candidate to another without needing to
first withdraw support from the candidate being replaced. Without this, moving
approval to a new candidate could result in a less-approved candidate moving
momentarily into the set of elected candidates.

In the case of `ds-chief`, `n` is 1.

In addition, `ds-chief` weights votes according to the quantity of a voting
token they've chosen to lock up in the `DSChief` or `DSChiefApprovals` contract.

It's important to note that the voting token used in a `ds-chief` deployment
must be specified at the time of deployment and cannot be changed afterward.



## Notice for Client Implementations

If you are writing a frontend for this smart contract, please note that the
`address[]` parameters passed to the `etch` and `vote` functions must be
_byte-ordered sets_. E.g., `[0x0, 0x1, 0x2, ...]` is valid, `[0x1, 0x0, ...]`
and `[0x0, 0x0, 0x1, ...]` are not. This ordering constraint allows the contract
to cheaply ensure voters cannot multiply their weights by listing the same
candidate on their slate multiple times.


## APIs

There are two contracts in `ds-chief`: `DSChiefApprovals` and `DSChief`, which
inherits from `DSChiefApprovals`.

`DSChiefApprovals` provides the following public properties:

- `slates`: A mapping of `bytes32` to `address` arrays. Represents sets of
  candidates. Weighted votes are given to slates.
- `votes`: A mapping of voter addresses to the slate they have voted for.
- `approvals`: A mapping of candidate addresses to their `uint` weight.
- `deposits`: A mapping of voter addresses to `uint` number of tokens locked.
- `GOV`: `DSToken` used for voting.
- `IOU`: `DSToken` issued in exchange for locking `GOV` tokens.
- `hat`: Contains the address of the current "chief."
- `MAX_YAYS`: Maximum number of candidates a slate can hold.

Most of the functions are decorated with the the `note` modifier from [ds-note](https://dapp.tools/dappsys/ds-note.html), meaning that they fire a standardized event when called. Additionally, one custom event is also provided:

- `Etch(bytes32 indexed slate)`: Fired when a slate is created.

Its public functions are as follows:

### `DSChiefApprovals(DSToken GOV_, DSToken IOU_, uint MAX_YAYS_)`

The constructor.  Sets `GOV`, `IOU`, and `MAX_YAYS`.


### `lock(uint wad)`

Charges the user `wad` `GOV` tokens, issues an equal amount of `IOU` tokens to
the user, and adds `wad` weight to the candidates on the user's selected slate.
Fires a `LogLockFree` event.


### `free(uint wad)`

Charges the user `wad` `IOU` tokens, issues an equal amount of `GOV` tokens to
the user, and subtracts `wad` weight from the candidates on the user's selected
slate. Fires a `LogLockFree` event.


### `etch(address[] yays) returns (bytes32 slate)`

Save a set of ordered addresses and return a unique identifier for it.


### `vote(address[] yays) returns (bytes32 slate)`

Save a set of ordered addresses as a slate, moves the voter's weight from their
current slate to the new slate, and returns the slate's identifier.


### `vote(bytes32 slate)`

Removes voter's weight from their current slate and adds it to the specified
slate.


### `lift(address whom)`

Checks the given address and promotes it to `chief` if it has more weight than
the current chief.


`DSChief` is a combination of `DSRoles` from the `ds-roles` package and
`DSChiefApprovals`. It can be used in conjunction with `ds-auth` to govern smart
contract systems.

Its public functions are as follows:


### `DSChief(DSToken GOV_, DSToken IOU_, uint MAX_YAYS_)`

The constructor.  Sets `GOV`, `IOU`, and `MAX_YAYS`.

### `setOwner(address owner_)`

Reverts the transaction. Overridden from `DSAuth`.

### `setAuthority(DSAuthority authority_)`

Reverts the transaction. Overridden from `DSAuth`.


### `isUserRoot(address who) constant returns (bool)`

Returns `true` if the given address is the chief.


### `setRootUser(address who, bool enabled)`

Reverts the transaction. Overridden from `DSRoles`.
