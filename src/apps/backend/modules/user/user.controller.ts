import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto, UpdateUserDto, UserResponseDto } from './user.dto';
import { PaginationDto } from '@/shared/dto/common.dto';
import { ApiPaginatedResponse } from '@/shared/decarators/api-paginated-response';
import { RequirePermission } from '@/shared/decarators/require-permission.decorator';
import { GetUser } from '@/shared/decarators/get-user.decorator';

@ApiBearerAuth()
@ApiTags('Users')
@Controller('api/user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @RequirePermission('users:read')
  @ApiPaginatedResponse(UserResponseDto)
  findAll(@Query() query: PaginationDto) {
    return this.userService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('users:read')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.userService.findOne(id);
  }

  @Post()
  @RequirePermission('users:edit')
  @ApiCreatedResponse({ type: UserResponseDto })
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Put(':id')
  @RequirePermission('users:edit')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('users:delete')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') currentUserId: number,
  ) {
    return this.userService.remove(id, currentUserId);
  }
}
