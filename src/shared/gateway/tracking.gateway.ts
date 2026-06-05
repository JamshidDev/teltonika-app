import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: true },
  namespace: '/tracking',
})
export class TrackingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('TrackingGateway');

  handleConnection(client: Socket) {
    this.logger.debug(`Client ulandi: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.warn(`Client uzildi: ${client.id}`);
  }

  @SubscribeMessage('track:subscribe')
  handleSubscribe(client: Socket) {
    this.logger.debug(`Client subscribe: ${client.id}`);
    void client.join('tracking');
  }

  @SubscribeMessage('track:unsubscribe')
  handleUnsubscribe(client: Socket) {
    void client.leave('tracking');
  }





  emitCarLocation(data: {
    carId: number;
    lat: number;
    lng: number;
    speed: number | null;
    angle: number | null;
    ignition: boolean | null;
    movement: boolean | null;
    status: string;
  }) {
    this.logger.debug(`Emit car:location carId: ${data.carId}`);
    this.server.to('tracking').emit('car:location', data);
  }

}
