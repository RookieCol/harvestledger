import { IsEmail, IsNotEmpty, isNotEmpty } from "class-validator";


export class ExistingUserDto{
    @IsNotEmpty()
    @IsEmail()
    email:string;
    @IsNotEmpty()
    password:string;
}