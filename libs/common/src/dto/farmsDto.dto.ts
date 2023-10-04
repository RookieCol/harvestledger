import { IsString } from "class-validator";


export class FarmDto {
    @IsString()
    name: string;
    @IsString()
    location: string;
    @IsString()
    userId: string;
}