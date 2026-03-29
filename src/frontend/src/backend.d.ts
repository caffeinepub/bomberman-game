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
    hostId: Principal;
    playerCount: bigint;
}

export interface backendInterface {
    getHighScore(): Promise<bigint>;
    submitScore(score: bigint): Promise<bigint>;
    createRoom(): Promise<string>;
    listRooms(): Promise<RoomInfo[]>;
    joinRoom(roomId: string): Promise<boolean>;
    leaveRoom(roomId: string): Promise<void>;
    keepAlive(roomId: string): Promise<void>;
    pushGameState(roomId: string, stateJson: string): Promise<void>;
    getGameState(roomId: string): Promise<[] | [string]>;
    submitP2Input(roomId: string, inputJson: string): Promise<void>;
    getAndClearP2Inputs(roomId: string): Promise<string[]>;
}
