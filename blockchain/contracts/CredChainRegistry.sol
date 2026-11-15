// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CredChainRegistry {
    struct Credential {
        address issuer;
        uint64 issuedAt;
        bool revoked;
    }

    address public immutable owner;
    mapping(address => bool) public issuers;
    mapping(bytes32 => Credential) private credentials;

    error Unauthorized();
    error InvalidCredentialHash();
    error CredentialAlreadyExists();
    error CredentialNotFound();
    error CredentialAlreadyRevoked();

    event IssuerAuthorizationChanged(address indexed issuer, bool authorized);
    event CredentialRegistered(bytes32 indexed credentialHash, address indexed issuer, uint64 issuedAt);
    event CredentialRevoked(bytes32 indexed credentialHash, address indexed issuer, uint64 revokedAt);

    constructor() {
        owner = msg.sender;
        issuers[msg.sender] = true;
        emit IssuerAuthorizationChanged(msg.sender, true);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyIssuer() {
        if (!issuers[msg.sender]) revert Unauthorized();
        _;
    }

    function setIssuer(address issuer, bool authorized) external onlyOwner {
        if (issuer == address(0)) revert Unauthorized();
        issuers[issuer] = authorized;
        emit IssuerAuthorizationChanged(issuer, authorized);
    }

    function registerCredential(bytes32 credentialHash) external onlyIssuer {
        if (credentialHash == bytes32(0)) revert InvalidCredentialHash();
        if (credentials[credentialHash].issuer != address(0)) revert CredentialAlreadyExists();

        uint64 issuedAt = uint64(block.timestamp);
        credentials[credentialHash] = Credential({ issuer: msg.sender, issuedAt: issuedAt, revoked: false });
        emit CredentialRegistered(credentialHash, msg.sender, issuedAt);
    }

    function revokeCredential(bytes32 credentialHash) external {
        Credential storage credential = credentials[credentialHash];
        if (credential.issuer == address(0)) revert CredentialNotFound();
        if (credential.issuer != msg.sender) revert Unauthorized();
        if (credential.revoked) revert CredentialAlreadyRevoked();

        credential.revoked = true;
        emit CredentialRevoked(credentialHash, msg.sender, uint64(block.timestamp));
    }

    function getCredential(bytes32 credentialHash) external view returns (address issuer, uint64 issuedAt, bool revoked) {
        Credential memory credential = credentials[credentialHash];
        return (credential.issuer, credential.issuedAt, credential.revoked);
    }

    function verifyCredential(bytes32 credentialHash) external view returns (bool) {
        Credential memory credential = credentials[credentialHash];
        return credential.issuer != address(0) && !credential.revoked;
    }
}