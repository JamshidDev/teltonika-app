import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';

// Rol yaratilmaydi/o'chirilmaydi — faqat permission biriktirish/uzish.
export class UpdateRolePermissionsDto {
  @ApiProperty({ example: ['map:read', 'vehicles:read'], type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions: string[];
}

export class RoleResponseDto {
  @ApiProperty({ example: 3 })
  id: number;

  @ApiProperty({ example: 'MapViewer' })
  name: string;

  @ApiProperty({ example: ['map:read'], type: [String] })
  permissions: string[];

  @ApiProperty({ example: false })
  isSystem: boolean;

  @ApiProperty({ example: 2 })
  userCount: number;
}
