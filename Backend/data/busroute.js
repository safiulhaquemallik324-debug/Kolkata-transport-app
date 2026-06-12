import { newtownRoutes } from "./Bus/east/newtownRoutes.js";
import { barsatroute } from "./Bus/north/barasatroute.js";
import { btroadroute } from "./Bus/north/btroadroute.js";

import { behalaRoutes } from "./Bus/south/behalaRoutes.js";
import { emBypassRoutes } from "./Bus/south/emBypassRoutes.js";
import { gariaroute } from "./Bus/south/gariaroute.js";
import { jadavpurRoutes } from "./Bus/south/jadavpurRoutes.js";
import { sonarpurRoutes } from "./Bus/south/sonarpurRoutes.js";

import { howrahroute } from "./Bus/west/howrahroute.js";
import { santragachiRoutes } from "./Bus/west/santragachiRoutes.js";


const busRoutes=[
        ...newtownRoutes,
        ...barsatroute,
        ...btroadroute,
        ...behalaRoutes,
        ...emBypassRoutes,
        ...gariaroute,
        ...jadavpurRoutes,
        ...sonarpurRoutes,
        ...howrahroute,
        ...santragachiRoutes
]

export default busRoutes;