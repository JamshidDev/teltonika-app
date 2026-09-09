import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleService } from './role.service';
import { RoleResponseDto, UpdateRolePermissionsDto } from './role.dto';
import { RequirePermission } from '@/shared/decarators/require-permission.decorator';

@ApiBearerAuth()
@ApiTags('Roles')
@Controller('api/role')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @RequirePermission('roles:read')
  findAll(): Promise<RoleResponseDto[]> {
    return this.roleService.findAll() as Promise<RoleResponseDto[]>;
  }

  // ':id' dan oldin turishi shart — aks holda 'permissions' id sifatida o'qiladi.
  @Get('permissions')
  @RequirePermission('roles:read')
  getCatalog() {
    return this.roleService.getCatalog();
  }

  @Get(':id')
  @RequirePermission('roles:read')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.roleService.findOne(id);
  }

  @Put(':id/permissions')
  @RequirePermission('roles:edit')
  updatePermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.roleService.updatePermissions(id, dto);
  }
}
