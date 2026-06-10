export declare class TableResponseDto {
    name: string;
    type?: string;
    engine?: string;
}
export declare class ColumnResponseDto {
    name: string;
    type: string;
    isNullable: boolean;
    defaultValue?: string;
}
