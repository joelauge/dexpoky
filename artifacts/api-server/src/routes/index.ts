import { Router, type IRouter } from "express";
import healthRouter from "./health";
import categoriesRouter from "./categories";
import cardsRouter from "./cards";
import marketplaceRouter from "./marketplace";
import bidsRouter from "./bids";
import inventoryRouter from "./inventory";
import pokemonRouter from "./pokemon";
import detectRouter from "./detect";
import usersRouter from "./users";
import ratingsRouter from "./ratings";
import priceHistoryRouter from "./price-history";

const router: IRouter = Router();

router.use(healthRouter);
router.use(categoriesRouter);
router.use(cardsRouter);
router.use(marketplaceRouter);
router.use(bidsRouter);
router.use(inventoryRouter);
router.use(pokemonRouter);
router.use(detectRouter);
router.use(usersRouter);
router.use(ratingsRouter);
router.use(priceHistoryRouter);

export default router;
