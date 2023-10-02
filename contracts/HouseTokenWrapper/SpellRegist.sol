// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/access/Ownable.sol";

interface IRegist{
    function isAuthSpell(address spell) external view returns(bool);
}

contract Vote {
    struct proposalMsg {
        uint256 index;
        address spell;
        address sender;
        uint256 expire;
        string desc;
    }
    
    enum Status {VOTING, PASSED, NOPASS}
    uint256 public lastId;                                              //last of proposals Id
    uint256 public line;                                                //line of proposals passed
    uint256 public indate;                                              //proposal indate
    mapping (uint256=> proposalMsg) public pom;                         //proposal MSG  
    mapping (uint256=> address[]) public poa;                           //proposal approves
    mapping (address=> uint256) public sopi;                            //spell of proposal's id
    mapping (uint256=> bool) public popi;                               //passed of proposal's id
 
    event SendProposal(uint256 indexed id, address indexed usr, address spell, string desc);
    event VoteProposal(uint256 indexed id, address indexed usr);
    
    function getProposalMSG(uint256 id) public view returns(address spell, address sender, string memory desc, uint256 expire, Status status, address[] memory approveds){
        proposalMsg memory pm = pom[id];
        (spell, sender, desc, expire, approveds) = (pm.spell, pm.sender, pm.desc, pm.expire, poa[id]);
        if (popi[id]){
            status = Status.PASSED;
        }else {
            status = pm.expire > block.timestamp ? Status.VOTING : Status.NOPASS;
        }
    }

    function _setLine(uint256 _line) internal {
        require(_line >0, "Error Line");
        line = _line;
    }

    function _setIndate(uint256 _indate) internal {
        require(_indate >= 1 && _indate <= 31 , "Error indate");
        indate = _indate * 1 days;
    }

    function _sendProposal(address _spell, string memory _desc) internal {
        require(sopi[_spell] == 0, "proposal exists");
        lastId++;
        pom[lastId]=proposalMsg(
            lastId,
            _spell,
            msg.sender,
            block.timestamp + indate,
            _desc
        );

        poa[lastId].push(msg.sender);
        sopi[_spell]=lastId;

        emit SendProposal(lastId, msg.sender, _spell, _desc);
    }

    function isApproved(address usr, uint256 id) public view returns(bool) {
        if (poa[id].length == 0){ return false;}
        for (uint256 i=0; i < poa[id].length; i++){
            if(poa[id][i] == usr) {return true;}
        }
        return false;
    }

    function _vote(uint256 id) internal {
        require(pom[id].expire > block.timestamp, "proposal exprired");
        require(!isApproved(msg.sender, id), "caller was approverd");

        poa[id].push(msg.sender);
        if (poa[id].length == line){
            popi[id]=true;
        }

        emit VoteProposal(id, msg.sender);
    }
}

contract Auth{
    mapping (address => bool) public signers;
    uint256 public signerCount;
    function _rely(address usr) internal  {require(usr != address(0) && !signers[usr], "Auth: error"); signers[usr] = true; signerCount++;}
    function _deny(address usr) internal  {require(usr != address(0) && signers[usr], "Auth: error"); signers[usr] = false; signerCount--;}
    modifier auth {
        require(signers[msg.sender], "not-authorized");
        _;
    }
}

contract SpellRegist is IRegist, Ownable, Vote, Auth{
    bool public pause;
    address public authORG;
    mapping(address=>bool) internal authSpells;
    event Regist(address spell);

    constructor(uint256 _line, uint256 _indate, address[] memory _signers){
        _setLine(_line);
        _setIndate(_indate);
        for(uint256 i=0; i< _signers.length; i++){
            _rely(_signers[i]);
        }
    }

    function setPause(bool flag) public onlyOwner { pause = flag;}
    function rely(address usr) public onlyOwner { _rely(usr);}
    function deny(address usr) public onlyOwner { _deny(usr);}
    function setLine(uint256 vaule) public onlyOwner {_setLine(vaule);}
    function setIndate(uint256 vaule) public onlyOwner {_setIndate(vaule);}
    function setAuthORG(address org) public onlyOwner{
        require(org != address(0), "org can't be 0");
        authORG = org;
    }

    function sendProposal(address spell, string memory desc) public auth {
        require(!pause, "stop");
        _sendProposal(spell, desc);
    }

    function vote(uint id) public auth {
        require(!pause, "stop");
        _vote(id); 
        address spell = pom[id].spell;
        if (popi[id] && !authSpells[spell]){ _regist(spell);}
    }

    function _regist(address spell) internal{
        authSpells[spell]= true;
        emit Regist(spell);
    }

    function isAuthSpell(address spell) public view override returns(bool){
        if (!pause){
             return authSpells[spell];
        }else {
             return IRegist(authORG).isAuthSpell(spell);
        }
    }
}

