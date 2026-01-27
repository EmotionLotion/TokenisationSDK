/**
 * Ticket Routes
 *
 * REST API endpoints for ticket management.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AirlineService } from '../services/airline.js';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const FlightSchema = z.object({
  number: z.string().min(2).max(10),
  departure: z.string().length(3), // Airport code
  arrival: z.string().length(3),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  class: z.enum(['economy', 'premium_economy', 'business', 'first']),
  seat: z.string().optional(),
});

const IssueTicketSchema = z.object({
  passengerId: z.string().min(1),
  passengerWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  flight: FlightSchema,
  price: z.number().positive(),
  currency: z.string().length(3).optional(),
});

const TransferTicketSchema = z.object({
  toPassengerId: z.string().min(1),
  toWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

const CancelTicketSchema = z.object({
  reason: z.string().min(1),
});

// ============================================================================
// ROUTER FACTORY
// ============================================================================

export function createTicketRouter(airlineService: AirlineService): Router {
  const router = Router();

  /**
   * POST /tickets - Issue a new ticket
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const data = IssueTicketSchema.parse(req.body);

      const ticket = await airlineService.issueTicket({
        passengerId: data.passengerId,
        passengerWallet: data.passengerWallet,
        flight: data.flight,
        price: data.price,
        currency: data.currency,
      });

      res.status(201).json({
        success: true,
        data: ticket,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      } else {
        console.error('Error issuing ticket:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to issue ticket',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  });

  /**
   * GET /tickets/:id - Get ticket details
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const ticket = await airlineService.getTicket(req.params.id);

      if (!ticket) {
        res.status(404).json({
          success: false,
          error: 'Ticket not found',
        });
        return;
      }

      res.json({
        success: true,
        data: ticket,
      });
    } catch (error) {
      console.error('Error getting ticket:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get ticket',
      });
    }
  });

  /**
   * GET /tickets - List tickets
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const passengerId = req.query.passengerId as string | undefined;

      if (passengerId) {
        const tickets = await airlineService.listPassengerTickets(passengerId);
        res.json({
          success: true,
          data: tickets,
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'passengerId query parameter is required',
        });
      }
    } catch (error) {
      console.error('Error listing tickets:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list tickets',
      });
    }
  });

  /**
   * POST /tickets/:id/transfer - Transfer ticket to another passenger
   */
  router.post('/:id/transfer', async (req: Request, res: Response) => {
    try {
      const data = TransferTicketSchema.parse(req.body);

      // Get current ticket to find the from wallet
      const ticket = await airlineService.getTicket(req.params.id);
      if (!ticket) {
        res.status(404).json({
          success: false,
          error: 'Ticket not found',
        });
        return;
      }

      // Note: In production, you'd get fromWallet from the authenticated user
      const fromWallet = req.body.fromWallet || '0x0000000000000000000000000000000000000000';

      const result = await airlineService.transferTicket(
        req.params.id,
        fromWallet,
        data.toWallet,
        data.toPassengerId
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      } else {
        console.error('Error transferring ticket:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to transfer ticket',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  });

  /**
   * POST /tickets/:id/cancel - Cancel and refund ticket
   */
  router.post('/:id/cancel', async (req: Request, res: Response) => {
    try {
      const data = CancelTicketSchema.parse(req.body);

      const result = await airlineService.cancelTicket(req.params.id, data.reason);

      res.json({
        success: true,
        data: {
          ticketId: req.params.id,
          status: 'cancelled',
          refund: result,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      } else {
        console.error('Error cancelling ticket:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to cancel ticket',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  });

  return router;
}
