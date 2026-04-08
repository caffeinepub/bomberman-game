import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface RoomInfo {
    id: string;
    gameStarted: boolean;
    hostName: string;
    gridSize: string;
    playerCount: bigint;
    roomName: string;
}
export interface backendInterface {
    createRoom(roomName: string, hostName: string, gridSize: string): Promise<string>;
    getAndClearP2Inputs(roomId: string): Promise<Array<string>>;
    getAnswer(roomId: string): Promise<string | null>;
    getGameState(roomId: string): Promise<string | null>;
    getGuestIce(roomId: string): Promise<Array<string>>;
    getHighScore(): Promise<bigint>;
    getHostIce(roomId: string): Promise<Array<string>>;
    getOffer(roomId: string): Promise<string | null>;
    hasGuest(roomId: string): Promise<boolean>;
    isGameStarted(roomId: string): Promise<boolean>;
    joinRoom(roomId: string): Promise<boolean>;
    keepAlive(roomId: string): Promise<void>;
    leaveRoom(roomId: string): Promise<void>;
    leaveRoomAsGuest(roomId: string): Promise<void>;
    leaveRoomAsHost(roomId: string): Promise<void>;
    listRooms(): Promise<Array<RoomInfo>>;
    pushAnswer(roomId: string, answer: string): Promise<void>;
    pushGameState(roomId: string, stateJson: string): Promise<void>;
    pushGuestIce(roomId: string, candidate: string): Promise<void>;
    pushHostIce(roomId: string, candidate: string): Promise<void>;
    pushOffer(roomId: string, offer: string): Promise<void>;
    startGame(roomId: string): Promise<void>;
    submitP2Input(roomId: string, inputJson: string): Promise<void>;
    submitScore(score: bigint): Promise<bigint>;
}
