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
import storageRouter from "./storage";
import shortenRouter from "./shorten";
import billingRouter from "./billing";

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
router.use(storageRouter);
router.use(shortenRouter);
router.use(billingRouter);

export default router;
