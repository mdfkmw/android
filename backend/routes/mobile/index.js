const express = require('express');

const router = express.Router();

router.use('/operators', require('./OperatorsApp'));
router.use('/employees', require('./EmployeesApp'));
router.use('/vehicles', require('./VehiclesApp'));
router.use('/routes', require('./RoutesApp'));
router.use('/stations', require('./StationsApp'));
router.use('/route_stations', require('./RouteStationsApp'));
router.use('/price_lists', require('./PriceListsApp'));
router.use('/price_list_items', require('./PriceListItemsApp'));
router.use('/', require('./driverApp'));

module.exports = router;
