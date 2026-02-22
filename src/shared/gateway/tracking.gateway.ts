import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: true },
  namespace: '/tracking',
})
export class TrackingGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('track:subscribe')
  handleSubscribe(client: Socket) {
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
  }) {
    this.server.to('tracking').emit('car:location', data);
  }
}